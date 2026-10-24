# Next.js File Uploads with Tigris

## Upload — Server Action

```typescript
"use server";
import { put } from "@tigrisdata/storage";

export async function uploadFile(formData: FormData) {
  const file = formData.get("file") as File;
  const result = await put(`uploads/${file.name}`, file, {
    contentType: file.type,
  });
  if (result.error) throw result.error;
  return result.data;
}
```

## Upload — API Route

```typescript
// app/api/upload/route.ts
import { put } from "@tigrisdata/storage";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File;
  const result = await put(`uploads/${file.name}`, file, {
    contentType: file.type,
  });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json(result.data);
}
```

## Download / Serve

```typescript
import { get } from "@tigrisdata/storage";

// Serve inline (images, PDFs in browser)
const result = await get("uploads/photo.jpg", "file", { contentDisposition: "inline" });

// Force download
const result = await get("uploads/report.pdf", "file", { contentDisposition: "attachment" });
```

## Client-Side Direct Upload (Browser → Tigris)

### Server Endpoint

```typescript
// app/api/upload/route.ts
import { handleClientUpload } from "@tigrisdata/storage";

export async function POST(request: Request) {
  const body = await request.json();
  const { data, error } = await handleClientUpload(body);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
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

## Image Serving with next/image

```typescript
// next.config.ts
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.t3.storage.dev" }],
  },
};
```

```tsx
import Image from "next/image";
<Image src={imageUrl} alt="Photo" width={800} height={600} />
```
