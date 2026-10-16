// SPDX-License-Identifier: Apache-2.0
package app.bihon.android

import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.SingleIn
import eu.kanade.tachiyomi.extension.ExtensionManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import logcat.LogPriority
import mihon.core.metro.AppCoroutineScope
import mihon.domain.extension.interactor.BihonDefaultExtensionStore
import tachiyomi.core.common.util.system.logcat
import kotlin.time.Duration.Companion.seconds

/** Starts after app and database migrations; no startup screen waits for this work. */
@Inject
@SingleIn(AppScope::class)
class BihonDefaultExtensionStoreSetup(
    private val defaultStore: BihonDefaultExtensionStore,
    private val extensionManager: ExtensionManager,
    @AppCoroutineScope private val scope: CoroutineScope,
) {
    private var job: Job? = null

    @Synchronized
    fun start() {
        if (job?.isActive == true) return
        job = scope.launch {
            while (isActive) {
                val newlyRegistered = try {
                    defaultStore.ensureRegistered()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    logcat(LogPriority.WARN, e) { "Default extension store setup will retry" }
                    delay(30.seconds)
                    continue
                }
                if (newlyRegistered) {
                    // Normal native catalog loading preserves all APK install/trust checks.
                    try {
                        withTimeoutOrNull(30.seconds) { extensionManager.findAvailableExtensions() }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        logcat(LogPriority.WARN, e) { "Default extension catalog is temporarily unavailable" }
                    }
                }
                return@launch
            }
        }
    }
}
