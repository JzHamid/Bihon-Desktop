import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Owns the server JVM. Parent exit/EOF runs Java shutdown hooks even on Windows. */
public final class BihonServer {
    public static void main(String[] args) throws Exception {
        Thread watcher = new Thread(() -> {
            try {
                BufferedReader input = new BufferedReader(new InputStreamReader(System.in));
                while (true) {
                    String line = input.readLine();
                    if (line == null || line.equals("shutdown")) System.exit(0);
                }
            } catch (Exception ignored) { System.exit(0); }
        }, "bihon-parent-watch");
        watcher.setDaemon(true);
        watcher.start();
        Class.forName("suwayomi.tachidesk.MainKt").getMethod("main").invoke(null);
    }
}
