use serde_json::Value;
use std::collections::HashMap;

type OramaDocument = HashMap<String, Value>;

pub struct OramaCoreClient {
    url: String,
    read_api_key: Option<String>,
    write_api_key: Option<String>,

    collection: Option<String>,
}

pub struct OramaCoreClientParams {
    url: String,
    read_api_key: Option<String>,
    write_api_key: Option<String>,
}

impl OramaCoreClient {
    pub fn new(params: OramaCoreClientParams) -> Self {
        let OramaCoreClientParams {
            url,
            read_api_key,
            write_api_key,
        } = params;

        Self {
            url,
            read_api_key,
            write_api_key,
            collection: None,
        }
    }

    pub fn set_collection(&mut self, collection_id: String) {
        self.collection = Some(collection_id);
    }

    pub fn insert(
        &mut self,
        documents: Vec<OramaDocument>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let collection = self
            .collection
            .as_ref()
            .ok_or_else(|| "No collection specified. Make sure to call set_collection() first.")?;

        let write_api_key = self.write_api_key.as_ref().ok_or_else(|| {
            "Cannot perform write operation (delete) as there is no write_api_key set."
        })?;

        let url = format!("{}/collections/{}/insert", self.url, collection);
        let client = reqwest::blocking::Client::new();

        let response = client
            .post(&url)
            .header("Authorization", write_api_key)
            .header("Content-Type", "application/json")
            .body(serde_json::to_string(&documents)?)
            .send()?;

        response.error_for_status()?;

        Ok(())
    }

    pub fn delete(&mut self, document_ids: Vec<String>) -> Result<(), Box<dyn std::error::Error>> {
        let collection = self
            .collection
            .as_ref()
            .ok_or_else(|| "No collection specified. Make sure to call set_collection() first.")?;

        let write_api_key = self.write_api_key.as_ref().ok_or_else(|| {
            "Cannot perform write operation (delete) as there is no write_api_key set."
        })?;

        let url = format!("{}/collections/{}/delete", self.url, collection);

        reqwest::blocking::Client::new()
            .post(&url)
            .header("Authorization", write_api_key)
            .header("Content-Type", "application/json")
            .body(serde_json::to_string(&document_ids)?)
            .send()?
            .error_for_status()?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        internal::nlp::Language,
        manager::{NewCollectionParams, OramaCoreManager},
    };

    use super::*;

    fn get_client() -> OramaCoreClient {
        let manager = OramaCoreManager::new(
            "http://localhost:8080".to_string(),
            "my-master-api-key".to_string(),
        );

        if manager.get_collection("my-collection".to_string()).is_err() {
            let _ = manager.create_collection(NewCollectionParams {
                id: "my-collection".to_string(),
                read_api_key: "read_api_key".to_string(),
                write_api_key: "write_api_key".to_string(),
                ..Default::default()
            });
        }

        OramaCoreClient::new(OramaCoreClientParams {
            url: "http://localhost:8080".to_string(),
            read_api_key: Some("read_api_key".to_string()),
            write_api_key: Some("write_api_key".to_string()),
        })
    }

    #[test]
    fn test_client_new() {
        let client = get_client();

        assert_eq!(client.url, "http://localhost:8080");
        assert_eq!(client.read_api_key, Some("read_api_key".to_string()));
        assert_eq!(client.write_api_key, Some("write_api_key".to_string()));
    }

    #[test]
    fn test_client_set_collection() {
        let mut client = get_client();

        client.set_collection("my-collection".to_string());

        assert_eq!(client.collection, Some("my-collection".to_string()));
    }

    #[test]
    fn test_client_insert() {
        let mut client = get_client();

        client.set_collection("my-collection".to_string());

        let doc1: OramaDocument = HashMap::from_iter(vec![
            ("id".to_string(), serde_json::to_value("123").unwrap()),
            (
                "text".to_string(),
                serde_json::to_value("The quick brown fox jumps over the lazy dog").unwrap(),
            ),
        ]);

        let doc2 = HashMap::from_iter(vec![
            ("id".to_string(), serde_json::to_value("456").unwrap()),
            (
                "text".to_string(),
                serde_json::to_value("I love my lazy dog").unwrap(),
            ),
        ]);

        let response = client.insert(vec![doc1, doc2]);

        assert!(response.is_ok());
    }
}
