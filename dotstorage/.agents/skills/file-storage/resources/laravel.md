# Laravel File Uploads with Tigris

> **Note:** No native Tigris PHP SDK exists yet. Uses `league/flysystem-aws-s3-v3` via Laravel's S3 disk driver.

## Configuration

```php
// config/filesystems.php
'tigris' => [
    'driver' => 's3',
    'key' => env('TIGRIS_STORAGE_ACCESS_KEY_ID'),
    'secret' => env('TIGRIS_STORAGE_SECRET_ACCESS_KEY'),
    'region' => 'auto',
    'bucket' => env('TIGRIS_STORAGE_BUCKET'),
    'url' => env('TIGRIS_STORAGE_ENDPOINT'),
    'endpoint' => env('TIGRIS_STORAGE_ENDPOINT'),
    'use_path_style_endpoint' => true,
],
```

## Upload — Controller

```php
// app/Http/Controllers/DocumentController.php
public function store(Request $request)
{
    $request->validate(['file' => 'required|file|max:51200']);
    $path = $request->file('file')->store('uploads', 'tigris');
    return response()->json(['path' => $path]);
}
```

## Download / Serve

```php
// Inline
return Storage::disk('tigris')->response($path);

// Download
return Storage::disk('tigris')->download($path, $filename);
```

## Presigned URLs

```php
// Download URL
$url = Storage::disk('tigris')->temporaryUrl($path, now()->addHour());

// Upload URL
$url = Storage::disk('tigris')->temporaryUploadUrl("uploads/{$filename}", now()->addMinutes(10));
return response()->json(['url' => $url]);
```

Browser client for presigned uploads:

```javascript
const { url } = await fetch("/api/presigned-upload", { method: "POST", body: JSON.stringify({ filename, contentType }) }).then(r => r.json());
await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
```

## Livewire Upload with Progress

```php
// app/Livewire/FileUpload.php
use Livewire\WithFileUploads;

class FileUpload extends Component
{
    use WithFileUploads;
    public $file;

    public function save()
    {
        $this->validate(['file' => 'file|max:51200']);
        $this->file->store('uploads', 'tigris');
    }
}
```
