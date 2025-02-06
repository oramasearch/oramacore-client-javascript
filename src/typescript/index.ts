import { OramaCoreManager } from "./src/manager";
import { CollectionManager } from "./src/collection";

const orama = new OramaCoreManager({
    url: 'http://localhost:8080',
    masterAPIKey: 'my-master-api-key',
})


await orama.createCollection({
    id: 'my-collection',
    description: 'My collection description',
    readAPIKey: 'xyz',
    writeAPIKey: 'abc',
})

await orama.listCollections()

await orama.getCollection('my-collection')

const collectionManager = new CollectionManager({
    url: 'http://localhost:8080',
    collectionID: 'my-collection',
    readAPIKey: 'read_api_key',
    writeAPIKey: 'write_api_key',
})

