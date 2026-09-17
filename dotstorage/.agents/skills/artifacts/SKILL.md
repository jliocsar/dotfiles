---
name: artifacts
description: Upload or list remote artifacts. Use when the user asks to upload an HTML or MD artifact remotely.
---

## Hosting

If the user provided a raw HTML file with no styles / CSS applied for hosting, use `prettify-html /path/to/raw.html --export > /path/to/output.html` before starting.

To host the artifact file, use `artifacts --help` to read about the `host` command and other options.

Once the artifact is hosted, output its URL.

## Listing

Use `artifacts ls` to list the currently hosted artifacts.
