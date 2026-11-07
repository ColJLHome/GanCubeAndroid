package com.coljlhome.gancube;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Same schema as the desktop application, with atomic restore and idempotent saves. */
public final class CubeStore {
    private final File file;
    private static final String[] TIMING_COLUMNS = {"id", "started_at", "finished_at", "duration_ms", "outcome", "cube_id", "cube_name", "initial_facelets"};
    private static final String[] TIMING_KEYS = {"id", "startedAt", "finishedAt", "durationMs", "outcome", "cubeId", "cubeName", "initialFacelets"};
    public CubeStore(Context context) { file = context.getDatabasePath("gancube.sqlite"); }
    private SQLiteDatabase open() {
        file.getParentFile().mkdirs();
        SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(file, null);
        db.execSQL("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
        db.execSQL("CREATE TABLE IF NOT EXISTS timings (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT NOT NULL, duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0), outcome TEXT NOT NULL CHECK(outcome IN ('solved','manual','reset','interrupted')), cube_id TEXT, cube_name TEXT, initial_facelets TEXT NOT NULL)");
        db.execSQL("CREATE INDEX IF NOT EXISTS timings_by_date ON timings(started_at DESC)");
        db.setVersion(1);
        return db;
    }
    static String now() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }
    public synchronized Object request(String path, String method, JSONObject body) throws Exception {
        try (SQLiteDatabase db = open()) {
            if (path.equals("cubes") && method.equals("GET")) {
                rememberLegacyCube(db);
                JSONArray result = new JSONArray();
                try (Cursor cursor = db.rawQuery("SELECT value FROM settings WHERE key LIKE 'cube:%' ORDER BY updated_at DESC, key", null)) {
                    while (cursor.moveToNext()) {
                        JSONObject cube = new JSONObject(cursor.getString(0));
                        result.put(new JSONObject().put("name", cube.getString("name")).put("mac", cube.getString("mac")));
                    }
                }
                return result;
            }
            if (path.equals("settings/last-cube") || path.equals("settings/debugging")) {
                String key = path.endsWith("debugging") ? "debugging" : "lastCube";
                if (method.equals("GET")) {
                    try (Cursor cursor = db.rawQuery("SELECT value FROM settings WHERE key=?", new String[]{key})) {
                        if (!cursor.moveToFirst()) return JSONObject.NULL;
                        return key.equals("debugging") ? new JSONObject().put("enabled", Boolean.parseBoolean(cursor.getString(0))) : new JSONObject(cursor.getString(0));
                    }
                }
                if (!method.equals("PUT")) throw new IllegalArgumentException("Unsupported settings method");
                if (key.equals("debugging")) {
                    if (!(body.opt("enabled") instanceof Boolean)) throw new IllegalArgumentException("Invalid debugging preference");
                } else {
                    requireString(body, "id", 512); requireString(body, "name", 256);
                    if (!body.getString("mac").matches("(?i)([0-9a-f]{2}:){5}[0-9a-f]{2}")) throw new IllegalArgumentException("Invalid MAC address");
                    body.put("mac", body.getString("mac").toUpperCase(Locale.ROOT));
                }
                ContentValues values = new ContentValues();
                values.put("key", key);
                values.put("value", key.equals("debugging") ? body.get("enabled").toString() : body.toString());
                values.put("updated_at", now());
                db.beginTransaction();
                try {
                    if (key.equals("lastCube")) rememberLegacyCube(db);
                    if (db.insertWithOnConflict("settings", null, values, SQLiteDatabase.CONFLICT_REPLACE) == -1) throw new IOException("Could not save settings");
                    if (key.equals("lastCube")) {
                        values.put("key", "cube:" + body.getString("mac"));
                        if (db.insertWithOnConflict("settings", null, values, SQLiteDatabase.CONFLICT_REPLACE) == -1) throw new IOException("Could not remember cube");
                    }
                    db.setTransactionSuccessful();
                } finally { db.endTransaction(); }
                return body;
            }
            if (path.equals("timings") && method.equals("POST")) {
                requireString(body, "id", 128);
                if (!"solved".equals(body.optString("outcome"))) throw new IllegalArgumentException("Only solved timings can be saved");
                requireString(body, "startedAt", 64); requireString(body, "finishedAt", 64);
                if (!(body.opt("durationMs") instanceof Number) || body.getDouble("durationMs") < 0 || body.getDouble("durationMs") != body.getLong("durationMs")) throw new IllegalArgumentException("Invalid duration");
                if (!body.getString("initialFacelets").matches("[URFDLB]{54}")) throw new IllegalArgumentException("Invalid facelets");
                ContentValues values = new ContentValues();
                for (int i = 0; i < TIMING_KEYS.length; i++) {
                    if (i == 3) values.put(TIMING_COLUMNS[i], body.getLong(TIMING_KEYS[i]));
                    else if (body.isNull(TIMING_KEYS[i])) values.putNull(TIMING_COLUMNS[i]);
                    else values.put(TIMING_COLUMNS[i], body.getString(TIMING_KEYS[i]));
                }
                db.insertWithOnConflict("timings", null, values, SQLiteDatabase.CONFLICT_IGNORE);
                return new JSONObject().put("id", body.getString("id"));
            }
            Uri uri = Uri.parse(path);
            if ("timings".equals(uri.getPath()) && method.equals("GET")) {
                long limit = Math.min(500, Math.max(1, queryNumber(uri, "limit", 20)));
                long offset = Math.max(0, queryNumber(uri, "offset", 0));
                JSONArray result = new JSONArray();
                try (Cursor cursor = db.rawQuery("SELECT " + String.join(",", TIMING_COLUMNS) + " FROM timings WHERE outcome='solved' ORDER BY started_at DESC, rowid DESC LIMIT ? OFFSET ?", new String[]{String.valueOf(limit), String.valueOf(offset)})) {
                    while (cursor.moveToNext()) {
                        JSONObject row = new JSONObject();
                        for (int i = 0; i < TIMING_KEYS.length; i++) row.put(TIMING_KEYS[i], cursor.isNull(i) ? JSONObject.NULL : i == 3 ? cursor.getLong(i) : cursor.getString(i));
                        result.put(row);
                    }
                }
                return result;
            }
            throw new IllegalArgumentException("Unknown native database route");
        }
    }
    private static void requireString(JSONObject object, String key, int max) throws Exception {
        Object value = object.get(key);
        if (!(value instanceof String) || ((String) value).isEmpty() || ((String) value).length() > max) throw new IllegalArgumentException("Invalid " + key);
    }
    private static long queryNumber(Uri uri, String key, long fallback) {
        try { return Long.parseLong(uri.getQueryParameter(key)); }
        catch (NumberFormatException error) { return fallback; }
    }
    private static void rememberLegacyCube(SQLiteDatabase db) throws Exception {
        try (Cursor cursor = db.rawQuery("SELECT value,updated_at FROM settings WHERE key='lastCube'", null)) {
            if (!cursor.moveToFirst()) return;
            JSONObject cube = new JSONObject(cursor.getString(0));
            String mac = cube.optString("mac").toUpperCase(Locale.ROOT);
            if (!mac.matches("([0-9A-F]{2}:){5}[0-9A-F]{2}")) return;
            cube.put("mac", mac);
            ContentValues values = new ContentValues();
            values.put("key", "cube:" + mac);
            values.put("value", cube.toString());
            values.put("updated_at", cursor.getString(1));
            db.insertWithOnConflict("settings", null, values, SQLiteDatabase.CONFLICT_IGNORE);
        }
    }
    public synchronized void backup(OutputStream output) throws Exception {
        // Each operation closes its SQLite connection, leaving no pending journal
        // or WAL data. Serializing operations makes this a consistent snapshot on API 24+.
        try (SQLiteDatabase ignored = open()) { }
        try (InputStream input = new FileInputStream(file)) { copy(input, output); }
    }
    public synchronized void restore(File upload, File recovery) throws Exception {
        try (SQLiteDatabase incoming = SQLiteDatabase.openDatabase(upload.getPath(), null, SQLiteDatabase.OPEN_READONLY)) {
            try (Cursor integrity = incoming.rawQuery("PRAGMA integrity_check", null)) {
                if (!integrity.moveToFirst() || !"ok".equals(integrity.getString(0))) throw new IllegalArgumentException("Corrupt SQLite backup");
            }
            if (incoming.getVersion() != 1) throw new IllegalArgumentException("Unsupported backup schema");
            try (Cursor ignored = incoming.rawQuery("SELECT key,value,updated_at FROM settings LIMIT 0", null)) { ignored.getCount(); }
            try (Cursor ignored = incoming.rawQuery("SELECT " + String.join(",", TIMING_COLUMNS) + " FROM timings LIMIT 0", null)) { ignored.getCount(); }
        }
        try (OutputStream output = new FileOutputStream(recovery)) { backup(output); }
        try (SQLiteDatabase db = open()) {
            db.execSQL("ATTACH DATABASE ? AS incoming", new Object[]{upload.getPath()});
            try {
                db.beginTransaction();
                try {
                    db.execSQL("DELETE FROM main.settings");
                    db.execSQL("INSERT INTO main.settings SELECT key,value,updated_at FROM incoming.settings");
                    db.execSQL("DELETE FROM main.timings");
                    String columns = String.join(",", TIMING_COLUMNS);
                    db.execSQL("INSERT INTO main.timings (" + columns + ") SELECT " + columns + " FROM incoming.timings");
                    db.setTransactionSuccessful();
                } finally { db.endTransaction(); }
            } finally { db.execSQL("DETACH DATABASE incoming"); }
        }
    }
    public static void copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[65536];
        long total = 0;
        for (int count; (count = input.read(buffer)) != -1;) {
            total += count;
            if (total > 100L * 1024 * 1024) throw new IOException("Database exceeds the 100 MB limit");
            output.write(buffer, 0, count);
        }
    }
}
