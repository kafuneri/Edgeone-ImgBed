import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeDir,
  sanitizeFileName,
  resolveImagePath,
  formatImageUrls,
  mimeToExt,
} from "../edge-functions/_utils/path.js";

test("sanitizeDir should reject directory traversal", () => {
  assert.throws(() => sanitizeDir("../secret"), /Directory traversal/);
  assert.throws(() => sanitizeDir("foo/../bar"), /Directory traversal/);
  assert.throws(() => sanitizeDir("foo//bar"), /Consecutive slashes/);
  assert.throws(() => sanitizeDir("a/b/c/d/e/f"), /exceeds maximum limit/);
});

test("sanitizeDir should sanitize normal paths", () => {
  assert.equal(sanitizeDir(""), "");
  assert.equal(sanitizeDir("/blog/2026/"), "blog/2026");
  assert.equal(sanitizeDir("covers"), "covers");
  assert.equal(sanitizeDir("相册/旅游"), "相册/旅游");
});

test("sanitizeFileName should enforce extension whitelisting", () => {
  assert.throws(() => sanitizeFileName("script.exe"), /not supported/);
  assert.throws(() => sanitizeFileName("page.html"), /not supported/);
  assert.equal(sanitizeFileName("photo.png"), "photo.png");
  assert.equal(sanitizeFileName("photo.jxl"), "photo.jxl");
  assert.equal(sanitizeFileName("clip.mkv"), "clip.mkv");
  assert.equal(sanitizeFileName("song.mp3"), "song.mp3");
  assert.equal(sanitizeFileName("voice.m4a"), "voice.m4a");
  assert.equal(sanitizeFileName("readme.txt"), "readme.txt");
  assert.equal(sanitizeFileName("deploy.sh"), "deploy.sh");
  assert.equal(sanitizeFileName("archive.zip"), "archive.zip");
  assert.equal(sanitizeFileName("photo", "webp"), "photo.webp");
  assert.equal(sanitizeFileName("my cover 2026.jpg"), "my_cover_2026.jpg");
});

test("resolveImagePath should correctly compute blobKey and relPath", () => {
  const result = resolveImagePath("blog/2026", "header.png");
  assert.equal(result.dir, "blog/2026");
  assert.equal(result.name, "header.png");
  assert.equal(result.relPath, "blog/2026/header.png");
  assert.equal(result.blobKey, "img/blog/2026/header.png");
  assert.equal(result.mime, "image/png");

  const jxlResult = resolveImagePath("covers", "hero.jxl");
  assert.equal(jxlResult.mime, "image/jxl");
  assert.equal(jxlResult.blobKey, "img/covers/hero.jxl");

  const mkvResult = resolveImagePath("media", "clip.mkv", "mkv", "mkv");
  assert.equal(mkvResult.mime, "video/x-matroska");
  assert.equal(mkvResult.blobKey, "img/media/clip.mkv");

  const mp3Result = resolveImagePath("media", "song.mp3", "mp3", "mp3");
  assert.equal(mp3Result.mime, "audio/mpeg");
  assert.equal(mp3Result.blobKey, "img/media/song.mp3");

  const m4aResult = resolveImagePath("media", "voice.m4a", "m4a", "m4a");
  assert.equal(m4aResult.mime, "audio/mp4");
  assert.equal(m4aResult.blobKey, "img/media/voice.m4a");

  const txtResult = resolveImagePath("docs", "notes.txt", "txt", "txt");
  assert.equal(txtResult.mime, "text/plain; charset=utf-8");
  assert.equal(txtResult.blobKey, "img/docs/notes.txt");

  // Browser may send text/plain for .sh files; preserve .sh extension
  const shResult = resolveImagePath("scripts", "deploy.sh", "txt", "txt");
  assert.equal(shResult.name, "deploy.sh");
  assert.equal(shResult.relPath, "scripts/deploy.sh");
  assert.equal(shResult.mime, "text/plain; charset=utf-8");

  const zipResult = resolveImagePath("files", "bundle.zip", "zip", "zip");
  assert.equal(zipResult.mime, "application/zip");
  assert.equal(zipResult.blobKey, "img/files/bundle.zip");
});

test("formatImageUrls should construct format-aware markdown and absolute url", () => {
  const fakeRequest = { url: "https://img.example.com/api/upload" };
  const img = formatImageUrls(fakeRequest, "blog/test.webp");
  assert.equal(img.url, "https://img.example.com/img/blog/test.webp");
  assert.equal(img.markdown, "![test.webp](https://img.example.com/img/blog/test.webp)");

  const mp4 = formatImageUrls(fakeRequest, "media/clip.mp4");
  assert.equal(mp4.markdown, '<video src="https://img.example.com/img/media/clip.mp4" controls width="100%"></video>');

  const mkv = formatImageUrls(fakeRequest, "media/clip.mkv");
  assert.equal(mkv.markdown, '<video src="https://img.example.com/img/media/clip.mkv" controls width="100%"></video>');

  const mp3 = formatImageUrls(fakeRequest, "audio/bgm.mp3");
  assert.equal(mp3.markdown, '<audio src="https://img.example.com/img/audio/bgm.mp3" controls></audio>');

  const m4a = formatImageUrls(fakeRequest, "audio/voice.m4a");
  assert.equal(m4a.markdown, '<audio src="https://img.example.com/img/audio/voice.m4a" controls></audio>');

  const txt = formatImageUrls(fakeRequest, "docs/readme.txt");
  assert.equal(txt.markdown, "[readme.txt](https://img.example.com/img/docs/readme.txt)");

  const sh = formatImageUrls(fakeRequest, "scripts/deploy.sh");
  assert.equal(sh.markdown, "[deploy.sh](https://img.example.com/img/scripts/deploy.sh)");

  const zip = formatImageUrls(fakeRequest, "files/archive.zip");
  assert.equal(zip.markdown, "[archive.zip](https://img.example.com/img/files/archive.zip)");
});

test("mimeToExt should map common MIME types accurately", () => {
  assert.equal(mimeToExt("image/jpeg"), "jpg");
  assert.equal(mimeToExt("image/webp; charset=utf-8"), "webp");
  assert.equal(mimeToExt("image/avif"), "avif");
  assert.equal(mimeToExt("image/jxl"), "jxl");
  assert.equal(mimeToExt("image/svg+xml"), "svg");
  assert.equal(mimeToExt("image/x-icon"), "ico");
  assert.equal(mimeToExt("video/x-matroska"), "mkv");
  assert.equal(mimeToExt("audio/mpeg"), "mp3");
  assert.equal(mimeToExt("audio/mp4"), "m4a");
  assert.equal(mimeToExt("audio/x-m4a"), "m4a");
  assert.equal(mimeToExt("text/plain; charset=utf-8"), "txt");
  assert.equal(mimeToExt("text/x-shellscript"), "sh");
  assert.equal(mimeToExt("application/zip"), "zip");
  assert.equal(mimeToExt("application/x-zip-compressed"), "zip");
  assert.equal(mimeToExt("application/octet-stream", "png"), "png");
});

test("formatImageUrls should percent-encode non-ASCII path segments", () => {
  const req = new Request("https://img.example.com/api/upload");
  const out = formatImageUrls(req, "中文目录/测试 图.png", {});
  assert.equal(
    out.url,
    "https://img.example.com/img/%E4%B8%AD%E6%96%87%E7%9B%AE%E5%BD%95/%E6%B5%8B%E8%AF%95%20%E5%9B%BE.png"
  );
  assert.equal(
    out.markdown,
    "![测试 图.png](https://img.example.com/img/%E4%B8%AD%E6%96%87%E7%9B%AE%E5%BD%95/%E6%B5%8B%E8%AF%95%20%E5%9B%BE.png)"
  );
});
