<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-server-rules -->
# Next.js Server Files

When creating pages or routes, you must place them in the `app/` directory.

## Pages
Pages are React Server Components placed in `app/`.

```text
app/
  layout.tsx
  page.tsx
```

## Dynamic Routes
Dynamic routes are created by wrapping a directory name in square brackets.

```text
app/
  users/
    [id]/
      page.tsx
```

## Route Segments
Each directory in `app/` is a route segment. Order matters!

1. **Root**: `/`
2. **Segments**: `/users`, `/users/[id]`

## Server Components
By default, all files in `app/` are React Server Components.

To opt into Client Components, add `'use client'` at the top:

```text
'use client'

import { useState } from 'react'
```

<!-- END:nextjs-server-rules -->
