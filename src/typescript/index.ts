import { CollectionManager } from './src/index.ts';

const orama = new CollectionManager({
    collectionID: 'tanstack-data',
    readAPIKey: 'read_api_key',
    writeAPIKey: 'write_api_key',
    url: 'http://localhost:8080',
})

const answerSession = orama.createAnswerSession()

const messages = answerSession.plannedAnswerStream({
    query: 'How do I enable table sorting?',
    interactionID: '123',
    sessionID: '123',
    visitorID: '123',
})

for await (const message of messages) {
    console.log(message)
}