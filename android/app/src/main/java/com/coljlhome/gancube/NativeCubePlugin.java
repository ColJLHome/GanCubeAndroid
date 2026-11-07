package com.coljlhome.gancube;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.JSONObject;
import java.io.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeCube")
public class NativeCubePlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private CubeStore store;
    private ScrambleGenerator puzzle;
    @Override public void load() { store = new CubeStore(getContext()); }

    @PluginMethod public void request(PluginCall call) {
        worker.execute(() -> {
            try {
                String path = call.getString("path", "");
                Object value;
                if (path.equals("scrambles/333")) {
                    if (puzzle == null) puzzle = new ScrambleGenerator();
                    value = new JSONObject().put("scramble", puzzle.generate()).put("source", "TNoodle min2phase 0.20.0");
                } else {
                    value = store.request(path, call.getString("method", "GET"), new JSONObject(call.getString("body", "{}")));
                }
                JSObject result = new JSObject(); result.put("value", value); call.resolve(result);
            } catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }
    @PluginMethod public void backup(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE, call.getString("filename", "gancube.sqlite"));
        startActivityForResult(call, intent, "backupResult");
    }
    @ActivityCallback private void backupResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) { call.reject("Backup cancelled"); return; }
        worker.execute(() -> {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(result.getData().getData(), "wt")) {
                if (output == null) throw new IOException("Cannot open backup destination");
                store.backup(output); call.resolve();
            } catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }
    @PluginMethod public void restore(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        startActivityForResult(call, intent, "restoreResult");
    }
    @ActivityCallback private void restoreResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) { call.reject("Restore cancelled"); return; }
        worker.execute(() -> {
            File upload = null;
            try {
                upload = File.createTempFile("restore-", ".sqlite", getContext().getCacheDir());
                try (InputStream input = getContext().getContentResolver().openInputStream(result.getData().getData()); OutputStream output = new FileOutputStream(upload)) {
                    if (input == null) throw new IOException("Cannot read backup");
                    CubeStore.copy(input, output);
                }
                File recovery = new File(getContext().getExternalFilesDir(null), "gancube-before-restore-" + System.currentTimeMillis() + ".sqlite");
                store.restore(upload, recovery);
                JSObject value = new JSObject(); value.put("previousBackup", recovery.getAbsolutePath()); call.resolve(value);
            } catch (Exception error) { call.reject(error.getMessage(), error); }
            finally { if (upload != null) upload.delete(); }
        });
    }
    @Override protected void handleOnDestroy() { worker.shutdown(); }
}
