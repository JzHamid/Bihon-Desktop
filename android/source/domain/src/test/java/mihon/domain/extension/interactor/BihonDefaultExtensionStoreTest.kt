// SPDX-License-Identifier: Apache-2.0
package mihon.domain.extension.interactor

import eu.kanade.tachiyomi.extension.model.Extension
import io.kotest.matchers.shouldBe
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mihon.domain.extension.model.ExtensionStore
import mihon.domain.extension.repository.ExtensionStoreRepository
import org.junit.jupiter.api.Test
import tachiyomi.core.common.preference.InMemoryPreferenceStore
import tachiyomi.core.common.preference.Preference
import tachiyomi.core.common.preference.PreferenceStore
import java.io.IOException

class BihonDefaultExtensionStoreTest {
    private val storedMarker = InMemoryPreferenceStore.InMemoryPreference(
        BihonDefaultExtensionStore.COMPLETED_KEY,
        null,
        false,
    )
    private var markerWriteFailure = false
    private val marker = object : Preference<Boolean> by storedMarker {
        override fun set(value: Boolean) {
            if (markerWriteFailure) throw IOException("Preference write failed")
            storedMarker.set(value)
        }
    }
    private val preferences = object : PreferenceStore by InMemoryPreferenceStore() {
        override fun getBoolean(key: String, defaultValue: Boolean): Preference<Boolean> {
            key shouldBe BihonDefaultExtensionStore.COMPLETED_KEY
            defaultValue shouldBe false
            return marker
        }
    }
    private val repository = FakeRepository()
    private fun setup() = BihonDefaultExtensionStore(repository, preferences)

    @Test
    fun `offline first launch registers the exact pinned native store without a network request`() = runTest {
        val setup = setup()
        setup.ensureRegistered() shouldBe true
        setup.ensureRegistered() shouldBe false
        repository.stores.single() shouldBe ExtensionStore(
            indexUrl = "https://github.com/keiyoushi/extensions/raw/repo/index.pb",
            name = "Keiyoushi",
            badgeLabel = "KEI",
            signingKey = "9add655a78e96c4ec7a53ef89dccb557cb5d767489fac5e785d671a5a75d4da2",
            contact = ExtensionStore.Contact("https://keiyoushi.github.io", null),
            isLegacy = false,
            extensionListUrl = null,
        )
        repository.writes shouldBe 1
        marker.get() shouldBe true
    }

    @Test
    fun `canonical and legacy stores are adopted without overwriting other stores`() = runTest {
        val existing = BihonDefaultExtensionStore.pinnedStore().copy(
            indexUrl = "https://raw.githubusercontent.com/keiyoushi/extensions/repo/repo.json",
            name = "My existing name",
        )
        val custom = existing.copy(indexUrl = "https://example.com/index.pb", signingKey = "other")
        repository.stores.addAll(listOf(custom, existing))
        setup().ensureRegistered() shouldBe true
        repository.stores shouldBe listOf(custom, existing)
        repository.writes shouldBe 0
        marker.get() shouldBe true
    }

    @Test
    fun `a different URL with the official signing key is adopted without a duplicate`() = runTest {
        val existing = BihonDefaultExtensionStore.pinnedStore().copy(indexUrl = "https://example.com/mirror.pb")
        repository.stores.add(existing)
        setup().ensureRegistered() shouldBe true
        repository.stores shouldBe listOf(existing)
        repository.writes shouldBe 0
    }

    @Test
    fun `completed setup never restores a store the user removed across process restarts`() = runTest {
        val setup = setup()
        setup.ensureRegistered()
        RemoveExtensionStore(setup).invoke(BihonDefaultExtensionStore.INDEX_URL)
        repository.stores shouldBe emptyList()
        setup().ensureRegistered() shouldBe false
        setup().ensureRegistered() shouldBe false
        repository.writes shouldBe 1
    }

    @Test
    fun `explicit removal of an adopted store before setup suppresses registration`() = runTest {
        val existing = BihonDefaultExtensionStore.pinnedStore().copy(
            indexUrl = "https://raw.githubusercontent.com/keiyoushi/extensions/repo/repo.json",
        )
        repository.stores.add(existing)
        val setup = setup()
        RemoveExtensionStore(setup).invoke(existing.indexUrl)
        setup.ensureRegistered() shouldBe false
        repository.stores shouldBe emptyList()
        repository.writes shouldBe 0
        marker.get() shouldBe true
    }

    @Test
    fun `database read failure cannot be mistaken for an empty database and is retryable`() = runTest {
        repository.readFailure = IOException("Database not ready")
        expectFailure<IOException> { setup().ensureRegistered() }
        marker.get() shouldBe false
        repository.writes shouldBe 0
        repository.readFailure = null
        setup().ensureRegistered() shouldBe true
    }

    @Test
    fun `failed insert leaves completion unset and next attempt succeeds`() = runTest {
        val setup = setup()
        repository.writeFailure = IOException("Disk unavailable")
        expectFailure<IOException> { setup.ensureRegistered() }
        marker.get() shouldBe false
        repository.stores shouldBe emptyList()
        repository.writeFailure = null
        setup.ensureRegistered() shouldBe true
        repository.stores.size shouldBe 1
    }

    @Test
    fun `crash after committed insert but before marker recovers by adoption without another write`() = runTest {
        markerWriteFailure = true
        expectFailure<IOException> { setup().ensureRegistered() }
        repository.stores.size shouldBe 1
        marker.get() shouldBe false
        markerWriteFailure = false
        setup().ensureRegistered() shouldBe true
        repository.writes shouldBe 1
        marker.get() shouldBe true
    }

    @Test
    fun `existing default URL with unexpected key is preserved without granting trust or duplicating`() = runTest {
        val existing = BihonDefaultExtensionStore.pinnedStore().copy(signingKey = "unexpected-key")
        repository.stores.add(existing)
        expectFailure<IllegalStateException> { setup().ensureRegistered() }
        repository.stores shouldBe listOf(existing)
        repository.writes shouldBe 0
        marker.get() shouldBe false
    }

    @Test
    fun `simultaneous startup attempts commit exactly one registration`() = runTest {
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        repository.beforeWrite = {
            entered.complete(Unit)
            release.await()
        }
        val setup = setup()
        val first = async { setup.ensureRegistered() }
        entered.await()
        val second = async { setup.ensureRegistered() }
        runCurrent()
        repository.writes shouldBe 1
        release.complete(Unit)
        first.await() shouldBe true
        second.await() shouldBe false
        repository.stores.size shouldBe 1
    }

    @Test
    fun `explicit removal racing a pending registration wins and cannot be readded`() = runTest {
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        repository.beforeWrite = {
            entered.complete(Unit)
            release.await()
        }
        val setup = setup()
        val registration = async { setup.ensureRegistered() }
        entered.await()
        val removal = async { RemoveExtensionStore(setup).invoke(BihonDefaultExtensionStore.INDEX_URL) }
        runCurrent()
        release.complete(Unit)
        registration.await() shouldBe true
        removal.await()
        repository.stores shouldBe emptyList()
        setup().ensureRegistered() shouldBe false
        repository.writes shouldBe 1
    }

    @Test
    fun `failed removal does not report success and leaves the original store`() = runTest {
        val existing = BihonDefaultExtensionStore.pinnedStore()
        repository.stores.add(existing)
        repository.removeFailure = IOException("Delete failed")
        expectFailure<IOException> { RemoveExtensionStore(setup()).invoke(existing.indexUrl) }
        repository.stores shouldBe listOf(existing)
        marker.get() shouldBe false
    }

    @Test
    fun `removing another store does not suppress first registration`() = runTest {
        val other = BihonDefaultExtensionStore.pinnedStore().copy(
            indexUrl = "https://example.com/index.pb",
            signingKey = "other",
        )
        repository.stores.add(other)
        val setup = setup()
        RemoveExtensionStore(setup).invoke(other.indexUrl)
        marker.get() shouldBe false
        setup.ensureRegistered() shouldBe true
    }

    @Test
    fun `cancellation propagates without marking setup complete`() = runTest {
        repository.writeFailure = CancellationException("Cancelled")
        expectFailure<CancellationException> { setup().ensureRegistered() }
        marker.get() shouldBe false
        repository.stores shouldBe emptyList()
    }

    @Test
    fun `a lookalike repository name or URL is never adopted as the official store`() = runTest {
        val other = BihonDefaultExtensionStore.pinnedStore().copy(
            indexUrl = "https://github.com.evil.example/keiyoushi/extensions/raw/repo/index.pb",
            signingKey = "other",
        )
        repository.stores.add(other)
        BihonDefaultExtensionStore.isDefaultUrl(other.indexUrl) shouldBe false
        setup().ensureRegistered() shouldBe true
        repository.stores shouldBe listOf(other, BihonDefaultExtensionStore.pinnedStore())
    }

    private suspend inline fun <reified T : Throwable> expectFailure(block: suspend () -> Unit) {
        val failure = try {
            block()
            null
        } catch (e: Throwable) {
            e
        }
        (failure is T) shouldBe true
    }

    private class FakeRepository : ExtensionStoreRepository {
        val stores = mutableListOf<ExtensionStore>()
        var writes = 0
        var readFailure: Exception? = null
        var writeFailure: Exception? = null
        var removeFailure: Exception? = null
        var beforeWrite: suspend () -> Unit = {}

        override suspend fun insert(indexUrl: String): Result<Unit> = error("Must not fetch remote trust metadata")
        override suspend fun insertFromPreference(indexUrl: String, name: String) = error("Unexpected legacy insert")
        override suspend fun refreshAll() = error("Setup must not perform network operations")
        override suspend fun fetchExtensions(): List<Extension.Available> = error("Not a catalog loader")
        override fun getAllAsFlow(): Flow<List<ExtensionStore>> = flowOf(stores.toList())
        override fun getCountAsFlow(): Flow<Long> = flowOf(stores.size.toLong())

        override suspend fun getAll(): List<ExtensionStore> {
            readFailure?.let { throw it }
            return stores.toList()
        }

        override suspend fun upsert(store: ExtensionStore) {
            writes++
            beforeWrite()
            writeFailure?.let { throw it }
            stores.removeAll { it.indexUrl == store.indexUrl }
            stores.add(store)
        }

        override suspend fun remove(indexUrl: String) {
            removeFailure?.let { throw it }
            stores.removeAll { it.indexUrl == indexUrl }
        }
    }
}
