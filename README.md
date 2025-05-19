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

### The OramaCoreManager

This is the class that allows you to manage your entire OramaCore database. Use this for creating
and managing collections.

It requires a **master API key**, so we **STRONGLY DISCOURAGE** using this class in the browser.

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
})
```

### The CollectionManager

The collection manager is used to insert documents, perform search operations and answer sessions.
It requires a **write API key** for inserting, updating and deleting documents and a **read API
key** to perform search and answer sessions.

We **STRONGLY DISCOURAGE** using the **write API key** on browsers. Use the **read API key** only,
which is safe to share.

```js
import { CollectionManager } from '@orama/core'

const collectionManager = new CollectionManager({
  url: 'http://localhost:8080',
  collectionID: 'my-new-collection',
  readAPIKey: 'my-read-api-key',
})

const result = await collectionManager.search({
  term: 'john',
  mode: 'vector',
  where: {
    age: {
      gt: 20,
    },
  },
})
```

### The Cloud Manager

You can use this SDK to manage your OramaCloud instances too.

When creating a new **REST API** data source, you can use the **transaction APIs** to correctly update your collections and indexes:

```js
import { CloudManager } from '@orama/core'

const cloudManager = new CloudManager({
  url: 'your-api-endpoint',
  collectionID: 'your-collection-id',
  privateAPIKey: 'your-private-api-key',
})

const datasource = cloudManager.setDataSource('your-datasource-id')

await datasource.insertDocuments([
  { id: '123', title: 'Quick Brown fox' },
  { id: '456', title: 'Jumping over a lazy dog' }
])

await datasource.deleteDocuments(['789'])

await datasource.commit()
```

For the full API reference, please go to
[https://docs.oramacore.com/docs/apis/introduction#javascript-sdk](https://docs.oramacore.com/docs/apis/introduction#javascript-sdk).

## License

[AGPLv3](/LICENSE.md)
