# Remix File Uploads with Tigris

## Upload — Action

```typescript
import { put } from "@tigrisdata/storage";
import { unstable_parseMultipartFormData, type ActionFunctionArgs } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await unstable_parseMultipartFormData(request, async ({ name, data, filename, contentType }) => {
    if (name !== "file") return undefined;
    const chunks: Uint8Array[] = [];
    for await (const chunk of data) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const result = await put(`uploads/${filename}`, buffer, { contentType });
    if (result.error) throw result.error;
    return result.data?.url;
  });
  return { url: formData.get("file") };
}
```

## Download / Serve

```typescript
import { get } from "@tigrisdata/storage";

// Serve inline
const result = await get("uploads/photo.jpg", "file", { contentDisposition: "inline" });

// Force download
const result = await get("uploads/report.pdf", "file", { contentDisposition: "attachment" });
```

## Client-Side Direct Upload (Browser → Tigris)

### Server Endpoint (Action)

```typescript
import { handleClientUpload } from "@tigrisdata/storage";

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json();
  const { data, error } = await handleClientUpload(body);
  if (error) return json({ error: error.message }, { status: 500 });
  return json({ data });
}
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
