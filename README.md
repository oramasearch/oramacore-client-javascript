# OramaCore JavaScript Client

The OramaCore JavaScript and TypeScript client.

## Installation

On Node:

```bash
npm i @orama/core
```

On Deno:

```js
import { CollectionManager, OramaCoreManager } from 'jsr:@orama/core'
```

On browsers:

```html
<script src="https://cdn.jsdelivr.net/npm/@orama/core/script/index.min.js"></script>
```

## Usage

The OramaCore client is made of two distinct classes:

---

## OramaCoreManager

**Purpose:**
- Used for administrative and global operations, such as creating, listing, and deleting collections.
- Requires a **master API key**. **Do not use in browsers.**

**Constructor:**
```js
new OramaCoreManager({
  url: string,           // The OramaCore server URL
  masterAPIKey: string,  // The master API key (admin-level)
})
```

**Example:**
```js
import { OramaCoreManager } from '@orama/core'

const manager = new OramaCoreManager({
  url: 'http://localhost:8080',
  masterAPIKey: 'my-master-api-key',
})

// Create a new collection
const newCollection = await manager.createCollection({
  id: 'my-new-collection',
  readAPIKey: 'my-read-api-key',
  writeAPIKey: 'my-write-api-key',
  description: 'A test collection',
})
```

---

## CollectionManager

**Purpose:**
- Used for all operations within a specific collection: document management, search, index management, segments, triggers, tools, and more.
- Requires an **API key** (read or write) or a **private API key** (JWT flow).

**Constructor:**
```js
new CollectionManager({
  collectionID: string,      // The unique ID of the collection to operate on (required)
  apiKey: string,            // The API key for authentication (required). Can be a read, write, or private key (see below).
  cluster?: {
    writerURL?: string,      // (Optional) Custom URL for write operations (e.g., inserts, updates, deletes)
    readURL?: string,        // (Optional) Custom URL for read operations (e.g., search, get)
  },
  authJwtURL?: string,       // (Optional) Custom JWT authentication endpoint (used only for private keys)
})
```

**Parameter Details:**
| Parameter         | Type     | Required | Description                                                                                 |
|-------------------|----------|----------|---------------------------------------------------------------------------------------------|
| `collectionID`    | string   | Yes      | The ID of the collection to interact with.                                                  |
| `apiKey`          | string   | Yes      | The API key for authentication. Can be a read key, write key, or a private key (see below). |
| `cluster.readURL` | string   | No       | Custom base URL for read operations (overrides default cloud endpoint).                     |
| `cluster.writerURL`| string  | No       | Custom base URL for write operations (overrides default cloud endpoint).                    |
| `authJwtURL`      | string   | No       | Custom JWT authentication endpoint (only used if `apiKey` is a private key). This overrides the default cloud endpoint                |

**Authentication Logic:**
- If `apiKey` starts with `'p_'`, it is treated as a **private key** and JWT authentication is used. The SDK will automatically obtain a JWT from `authJwtURL` (or the default cloud endpoint) and use it for write operations.
- Otherwise, the `apiKey` is used directly for all requests (either as a read or write key, depending on the operation).

**How URLs and Keys Are Used:**
- The SDK determines whether a request is a read or write operation and selects the appropriate base URL (`readURL` or `writerURL`).
- If custom URLs are not provided, the SDK defaults to OramaCore Cloud endpoints.

**Example:**
```js
import { CollectionManager } from '@orama/core'

const collectionManager = new CollectionManager({
  collectionID: 'my-new-collection',
  apiKey: 'my-read-api-key', // or 'my-write-api-key' or 'p_xxx' for private key
  // Optionally:
  // cluster: { writerURL: 'https://my-writer-url', readURL: 'https://my-reader-url' },
  // authJwtURL: 'https://custom-jwt-url',
})

const result = await collectionManager.search({
  term: 'john',
  mode: 'vector',
  where: {
    age: { gt: 20 },
  },
})
```

## License

[AGPLv3](/LICENSE.md)
