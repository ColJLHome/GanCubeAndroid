package com.coljlhome.gancube;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import org.robolectric.RuntimeEnvironment;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import java.io.*;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class CubeStoreTest {
    private Context context;
    private CubeStore store;
    @Before public void setup() {
        context = RuntimeEnvironment.getApplication();
        context.deleteDatabase("gancube.sqlite");
        store = new CubeStore(context);
    }
    private JSONObject timing(String id) throws Exception {
        return new JSONObject().put("id", id).put("startedAt", "2026-11-07T10:00:00.000Z")
            .put("finishedAt", "2026-11-07T10:00:12.345Z").put("durationMs", 12345)
            .put("outcome", "solved").put("initialFacelets", "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB");
    }
    @Test public void solvedRecordsPersistAndRetriesAreIdempotent() throws Exception {
        store.request("timings", "POST", timing("one"));
        store.request("timings", "POST", timing("one"));
        JSONArray rows = (JSONArray) new CubeStore(context).request("timings?limit=20", "GET", new JSONObject());
        assertEquals(1, rows.length());
        assertEquals(12345, rows.getJSONObject(0).getLong("durationMs"));
        assertTrue(rows.getJSONObject(0).isNull("cubeId"));
    }
    @Test public void settingsSurviveReopening() throws Exception {
        store.request("settings/debugging", "PUT", new JSONObject().put("enabled", false));
        JSONObject value = (JSONObject) new CubeStore(context).request("settings/debugging", "GET", new JSONObject());
        assertFalse(value.getBoolean("enabled"));
    }
    @Test public void unfinishedSolvesAreRejected() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> store.request("timings", "POST", timing("bad").put("outcome", "manual")));
        assertEquals(0, ((JSONArray) store.request("timings", "GET", new JSONObject())).length());
    }
    @Test public void backupRestoresRecordsAndKeepsRecovery() throws Exception {
        store.request("timings", "POST", timing("one"));
        File backup = File.createTempFile("cube-", ".sqlite", context.getCacheDir());
        try (OutputStream output = new FileOutputStream(backup)) { store.backup(output); }
        store.request("timings", "POST", timing("two"));
        File recovery = new File(context.getCacheDir(), "recovery.sqlite");
        store.restore(backup, recovery);
        assertEquals(1, ((JSONArray) store.request("timings", "GET", new JSONObject())).length());
        store.restore(recovery, new File(context.getCacheDir(), "recovery2.sqlite"));
        assertEquals(2, ((JSONArray) store.request("timings", "GET", new JSONObject())).length());
    }
    @Test public void registryRetainsCubesAndUpdatesByNormalizedMac() throws Exception {
        JSONObject first = new JSONObject().put("id", "browser-one").put("name", "First cube").put("mac", "AA:BB:CC:DD:EE:FF");
        JSONObject second = new JSONObject().put("id", "browser-two").put("name", "Second cube").put("mac", "11:22:33:44:55:66");
        store.request("settings/last-cube", "PUT", first);
        store.request("settings/last-cube", "PUT", second);
        store.request("settings/last-cube", "PUT", first.put("id", "another-device").put("name", "Updated cube").put("mac", "aa:bb:cc:dd:ee:ff"));
        JSONArray cubes = (JSONArray) new CubeStore(context).request("cubes", "GET", new JSONObject());
        assertEquals(2, cubes.length());
        boolean foundUpdated = false;
        for (int i = 0; i < cubes.length(); i++) {
            JSONObject cube = cubes.getJSONObject(i);
            assertFalse(cube.has("id"));
            if (cube.getString("mac").equals("AA:BB:CC:DD:EE:FF")) {
                assertEquals("Updated cube", cube.getString("name"));
                foundUpdated = true;
            }
        }
        assertTrue(foundUpdated);
    }
    @Test public void oldBackupLastCubeIsRetainedAndRegistrySurvivesRestore() throws Exception {
        store.request("timings", "GET", new JSONObject());
        JSONObject legacy = new JSONObject().put("id", "old-browser").put("name", "Legacy cube").put("mac", "aa:bb:cc:dd:ee:ff");
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(context.getDatabasePath("gancube.sqlite").getPath(), null, SQLiteDatabase.OPEN_READWRITE)) {
            db.execSQL("INSERT INTO settings VALUES('lastCube',?,?)", new Object[]{legacy.toString(), "2026-01-01T00:00:00Z"});
        }
        store.request("settings/last-cube", "PUT", new JSONObject().put("id", "new-device").put("name", "New cube").put("mac", "11:22:33:44:55:66"));
        File backup = File.createTempFile("registry-", ".sqlite", context.getCacheDir());
        try (OutputStream output = new FileOutputStream(backup)) { store.backup(output); }
        context.deleteDatabase("gancube.sqlite");
        store.restore(backup, new File(context.getCacheDir(), "before-registry.sqlite"));
        assertEquals(2, ((JSONArray) store.request("cubes", "GET", new JSONObject())).length());
    }
    @Test public void timingPagesCoverMoreThan500SolvesWithStableTieOrdering() throws Exception {
        store.request("timings", "GET", new JSONObject());
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(context.getDatabasePath("gancube.sqlite").getPath(), null, SQLiteDatabase.OPEN_READWRITE)) {
            db.beginTransaction();
            try {
                for (int i = 0; i < 505; i++) {
                    JSONObject row = timing("page-" + i);
                    db.execSQL("INSERT INTO timings(id,started_at,finished_at,duration_ms,outcome,initial_facelets) VALUES(?,?,?,?,?,?)", new Object[]{row.getString("id"),row.getString("startedAt"),row.getString("finishedAt"),12345,"solved",row.getString("initialFacelets")});
                }
                db.setTransactionSuccessful();
            } finally { db.endTransaction(); }
        }
        JSONArray first = (JSONArray) store.request("timings?limit=500&offset=0", "GET", new JSONObject());
        JSONArray last = (JSONArray) store.request("timings?offset=500&limit=500", "GET", new JSONObject());
        assertEquals(500, first.length()); assertEquals(5, last.length());
        assertEquals("page-504", first.getJSONObject(0).getString("id"));
        assertEquals("page-5", first.getJSONObject(499).getString("id"));
        assertEquals("page-4", last.getJSONObject(0).getString("id"));
        assertEquals("page-0", last.getJSONObject(4).getString("id"));
        assertEquals(0, ((JSONArray) store.request("timings?limit=500&offset=505", "GET", new JSONObject())).length());
        assertEquals(500, ((JSONArray) store.request("timings?limit=9999&offset=-1", "GET", new JSONObject())).length());
    }
    @Test public void invalidRestoreLeavesDatabaseUnchanged() throws Exception {
        store.request("timings", "POST", timing("one"));
        File invalid = File.createTempFile("bad-", ".sqlite", context.getCacheDir());
        try (OutputStream out = new FileOutputStream(invalid)) { out.write(new byte[]{1,2,3,4}); }
        assertThrows(Exception.class, () -> store.restore(invalid, new File(context.getCacheDir(), "unused.sqlite")));
        assertEquals(1, ((JSONArray) store.request("timings", "GET", new JSONObject())).length());
    }
}
