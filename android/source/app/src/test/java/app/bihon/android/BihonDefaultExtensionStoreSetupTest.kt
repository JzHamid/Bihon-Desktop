// SPDX-License-Identifier: Apache-2.0
package app.bihon.android

import eu.kanade.tachiyomi.extension.ExtensionManager
import io.kotest.matchers.shouldBe
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mihon.domain.extension.interactor.BihonDefaultExtensionStore
import org.junit.jupiter.api.Test
import java.io.IOException

class BihonDefaultExtensionStoreSetupTest {
    @Test
    fun `startup returns immediately and repeated starts do not duplicate work`() = runTest {
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val store = mockk<BihonDefaultExtensionStore>()
        val extensions = mockk<ExtensionManager>()
        coEvery { store.ensureRegistered() } coAnswers {
            entered.complete(Unit)
            release.await()
            true
        }
        coEvery { extensions.findAvailableExtensions() } returns Unit
        val setup = BihonDefaultExtensionStoreSetup(store, extensions, backgroundScope)
        setup.start()
        setup.start()
        entered.isCompleted shouldBe false
        runCurrent()
        entered.isCompleted shouldBe true
        release.complete(Unit)
        runCurrent()
        coVerify(exactly = 1) { store.ensureRegistered() }
        coVerify(exactly = 1) { extensions.findAvailableExtensions() }
    }

    @Test
    fun `temporary database failure retries in background after backoff`() = runTest {
        val store = mockk<BihonDefaultExtensionStore>()
        val extensions = mockk<ExtensionManager>()
        coEvery { store.ensureRegistered() } throws IOException("Busy") andThen true
        coEvery { extensions.findAvailableExtensions() } returns Unit
        val setup = BihonDefaultExtensionStoreSetup(store, extensions, backgroundScope)
        setup.start()
        runCurrent()
        coVerify(exactly = 1) { store.ensureRegistered() }
        coVerify(exactly = 0) { extensions.findAvailableExtensions() }
        advanceTimeBy(30_000)
        runCurrent()
        coVerify(exactly = 2) { store.ensureRegistered() }
        coVerify(exactly = 1) { extensions.findAvailableExtensions() }
    }

    @Test
    fun `offline catalog timeout does not roll back completed registration or block startup`() = runTest {
        val store = mockk<BihonDefaultExtensionStore>()
        val extensions = mockk<ExtensionManager>()
        coEvery { store.ensureRegistered() } returnsMany listOf(true, false)
        coEvery { extensions.findAvailableExtensions() } coAnswers { CompletableDeferred<Unit>().await() }
        val setup = BihonDefaultExtensionStoreSetup(store, extensions, backgroundScope)
        setup.start()
        runCurrent()
        advanceTimeBy(30_000)
        runCurrent()
        setup.start()
        runCurrent()
        coVerify(exactly = 2) { store.ensureRegistered() }
        coVerify(exactly = 1) { extensions.findAvailableExtensions() }
    }
}
