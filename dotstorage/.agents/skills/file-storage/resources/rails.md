# Rails File Uploads with Tigris

> **Note:** No native Tigris Ruby SDK exists yet. Uses `aws-sdk-s3` pointed at Tigris via Active Storage's S3 service.

## Configuration

```yaml
# config/storage.yml
tigris:
  service: S3
  access_key_id: <%= ENV["TIGRIS_STORAGE_ACCESS_KEY_ID"] %>
  secret_access_key: <%= ENV["TIGRIS_STORAGE_SECRET_ACCESS_KEY"] %>
  endpoint: https://t3.storage.dev
  bucket: <%= ENV["TIGRIS_STORAGE_BUCKET"] %>
  region: auto
  force_path_style: true
```

```ruby
# config/environments/production.rb
config.active_storage.service = :tigris
```

## Upload — Active Storage

```ruby
# app/models/document.rb
class Document < ApplicationRecord
  has_one_attached :file
  validates :file, presence: true
end

# app/controllers/documents_controller.rb
class DocumentsController < ApplicationController
  def create
    @document = Document.new(document_params)
    if @document.save
      redirect_to @document
    else
      render :new, status: :unprocessable_entity
    end
  end

  private
  def document_params = params.require(:document).permit(:file)
end
```

## Download / Serve

```ruby
# Inline display
redirect_to @document.file.url(expires_in: 1.hour)

# Force download
redirect_to @document.file.url(expires_in: 1.hour, disposition: "attachment")
```

## Direct Upload (Browser → Tigris)

```erb
<%= form.file_field :file, direct_upload: true %>
```

Requires `@rails/activestorage` JS and CORS configured on the Tigris bucket.

## Presigned URLs

```ruby
@document.file.url(expires_in: 1.hour)
```

## Image Variants

```ruby
<%= image_tag @document.file.variant(resize_to_limit: [800, 600]) %>
```

## Multipart

Active Storage handles multipart automatically for large files.
