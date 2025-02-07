import { CollectionManager } from './src/index.ts';

const orama = new CollectionManager({
    collectionID: 'tanstack-data',
    readAPIKey: 'read_api_key',
    writeAPIKey: 'write_api_key',
    url: 'http://localhost:8080',
})

const answerSession = orama.createAnswerSession()

await answerSession.answerStream({
    query: 'What is TanStack table?',
    interactionID: '123',
    sessionID: '123',
    visitorID: '123',
})