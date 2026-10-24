# Express File Uploads with Tigris

## Upload — Multer

```typescript
import express from "express";
import multer from "multer";
import { put } from "@tigrisdata/storage";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.post("/upload", upload.single("file"), async (req, res) => {
  const result = await put(`uploads/${req.file.originalname}`, req.file.buffer, {
    contentType: req.file.mimetype,
  });
  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json(result.data);
});
```

## Upload — Streaming (No Multer)

```typescript
import { put } from "@tigrisdata/storage";
import { Readable } from "stream";

app.post("/upload-stream", async (req, res) => {
  const filename = req.headers["x-filename"] as string;
  const contentType = req.headers["content-type"] ?? "application/octet-stream";
  const stream = Readable.from(req);
  const result = await put(`uploads/${filename}`, stream, { contentType, multipart: true });
  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json(result.data);
});
```

## Download / Serve

```typescript
import { get } from "@tigrisdata/storage";

// Serve inline
const result = await get("uploads/photo.jpg", "file", { contentDisposition: "inline" });

// Force download
const result = await get("uploads/report.pdf", "file", { contentDisposition: "attachment" });

// Stream large files
const result = await get("uploads/video.mp4", "stream");
result.data.pipe(res);
```

## Client-Side Direct Upload (Browser → Tigris)

### Server Endpoint

```typescript
import { handleClientUpload } from "@tigrisdata/storage";

app.post("/api/upload", async (req, res) => {
  const { data, error } = await handleClientUpload(req.body);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});
```

### Browser Client

```typescript
import { upload } from "@tigrisdata/storage/client";

const result = await upload(file.name, file, {
  url: "/api/upload",
  access: "private",
  multipart: true,
  onUploadProgress: ({ percentage }) => console.log(`${percentage}%`),
});
```

## Presigned URLs

```typescript
import { getPresignedUrl } from "@tigrisdata/storage";

// Download link (1 hour)
const { data } = await getPresignedUrl("reports/q4.pdf", { operation: "get", expiresIn: 3600 });

// Upload link (10 minutes)
const { data } = await getPresignedUrl("uploads/photo.jpg", { operation: "put", expiresIn: 600 });
```

## Multipart Uploads (Large Files)

```typescript
const result = await put("videos/demo.mp4", fileStream, {
  multipart: true,
  onUploadProgress: ({ loaded, total, percentage }) => {
    console.log(`${percentage}%`);
  },
});
```
