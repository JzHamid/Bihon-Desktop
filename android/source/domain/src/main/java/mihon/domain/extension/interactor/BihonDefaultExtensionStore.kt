// SPDX-License-Identifier: Apache-2.0
package mihon.domain.extension.interactor

import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import mihon.domain.extension.model.ExtensionStore
import mihon.domain.extension.repository.ExtensionStoreRepository
import tachiyomi.core.common.preference.Preference
import tachiyomi.core.common.preference.PreferenceStore

/** One-time registration; it never installs APKs or bypasses extension signature verification. */
@Inject
@SingleIn(AppScope::class)
class BihonDefaultExtensionStore(
    private val repository: ExtensionStoreRepository,
    preferenceStore: PreferenceStore,
) {
    private val completed = preferenceStore.getBoolean(COMPLETED_KEY)
    private val mutex = Mutex()

    // Keiyoushi's published metadata is pinned locally so an offline first launch works.
    // Use the native add interactor, with no second network fetch that could replace the pinned key.
    private val addStore = AddExtensionStore(object : ExtensionStoreRepository by repository {
        override suspend fun insert(indexUrl: String): Result<Unit> {
            require(indexUrl == INDEX_URL)
            return try {
                repository.upsert(pinnedStore())
                Result.success(Unit)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    })

    /** Returns true only when this call finishes setup, allowing one normal catalog refresh. */
    suspend fun ensureRegistered(): Boolean = mutex.withLock {
        if (completed.get()) return@withLock false

        val existing = repository.getAll().firstOrNull { isDefaultStore(it) }
        if (existing == null) {
            addStore(INDEX_URL).getOrThrow()
        } else {
            // Preserve an existing store without silently replacing its trust metadata.
            // A migrated legacy store can acquire the published key through native refresh.
            check(existing.signingKey == SIGNING_KEY) { "Existing default extension store has a different signing key" }
        }
        completed.set(true)
        true
    }

    /** Serialize explicit removal with setup, so the user's deletion wins either ordering. */
    suspend fun remove(indexUrl: String) = mutex.withLock {
        val isDefault = isDefaultUrl(indexUrl) || repository.getAll().any {
            it.indexUrl == indexUrl && it.signingKey == SIGNING_KEY
        }
        repository.remove(indexUrl)
        if (isDefault) completed.set(true)
    }

    companion object {
        const val INDEX_URL = "https://github.com/keiyoushi/extensions/raw/repo/index.pb"
        const val SIGNING_KEY = "9add655a78e96c4ec7a53ef89dccb557cb5d767489fac5e785d671a5a75d4da2"
        val COMPLETED_KEY = Preference.appStateKey("bihon_default_extension_store_complete")

        // Exact published URLs only: a lookalike host/path must never be adopted or trusted.
        private val aliases = setOf(
            INDEX_URL,
            "https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.pb",
            "https://github.com/keiyoushi/extensions/raw/refs/heads/repo/index.pb",
            "https://raw.githubusercontent.com/keiyoushi/extensions/refs/heads/repo/index.pb",
            "https://github.com/keiyoushi/extensions/raw/repo/repo.json",
            "https://raw.githubusercontent.com/keiyoushi/extensions/repo/repo.json",
            "https://github.com/keiyoushi/extensions/raw/repo/index.min.json",
            "https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json",
        )

        fun isDefaultUrl(indexUrl: String): Boolean = indexUrl in aliases

        private fun isDefaultStore(store: ExtensionStore): Boolean =
            isDefaultUrl(store.indexUrl) || store.signingKey == SIGNING_KEY

        fun pinnedStore() = ExtensionStore(
            indexUrl = INDEX_URL,
            name = "Keiyoushi",
            badgeLabel = "KEI",
            signingKey = SIGNING_KEY,
            contact = ExtensionStore.Contact(website = "https://keiyoushi.github.io", discord = null),
            isLegacy = false,
            extensionListUrl = null,
        )
    }
}
