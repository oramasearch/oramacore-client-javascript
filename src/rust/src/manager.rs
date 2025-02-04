use std::collections::HashMap;

use crate::internal::{embeddings::EmbeddingModel, nlp::Language, utils::gen_random_string};
use serde::{Deserialize, Serialize};

static RAND_API_KEY_LENGTH: usize = 32;

#[derive(Debug, Clone, Serialize)]
pub struct OramaCoreManager {
    url: String,
    master_api_key: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct NewCollectionParams {
    pub id: String,
    pub description: Option<String>,
    pub write_api_key: String,
    pub read_api_key: String,
    pub language: Option<Language>,
    pub embeddings: Option<EmbeddingsConfig>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EmbeddingsConfig {
    model: Option<EmbeddingModel>,
    document_fields: Option<Vec<String>>,
}

impl Default for NewCollectionParams {
    fn default() -> Self {
        NewCollectionParams {
            id: String::new(),
            description: None,
            write_api_key: gen_random_string(RAND_API_KEY_LENGTH),
            read_api_key: gen_random_string(RAND_API_KEY_LENGTH),
            embeddings: None,
            language: Some(Language::English),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewCollectionResponse {
    pub id: String,
    pub description: Option<String>,
    pub write_api_key: String,
    pub read_api_key: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum FieldType {
    Scalar { Scalar: ScalarType },
    Complex { Complex: ComplexType },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "lowercase")]
pub enum ScalarType {
    String,
    Number,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "lowercase")]
pub enum ComplexType {
    Embedding,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExistingCollection {
    pub id: String,
    pub description: Option<String>,
    pub document_count: usize,
    pub fields: HashMap<String, FieldType>,
}

impl OramaCoreManager {
    pub fn new(url: String, master_api_key: String) -> OramaCoreManager {
        OramaCoreManager {
            url,
            master_api_key,
        }
    }

    pub fn create_collection(
        &self,
        collection_config: NewCollectionParams,
    ) -> Result<NewCollectionResponse, Box<dyn std::error::Error>> {
        if collection_config.id.is_empty() {
            // @todo: we may want to validate it as well.
            return Err("Please provide a collection ID".into());
        }

        let url = format!("{}/v1/collections/create", self.url);
        let body = serde_json::to_string(&collection_config).unwrap();

        let _ = reqwest::blocking::Client::new()
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.master_api_key))
            .header("Content-Type", "application/json")
            .body(body)
            .send()?;

        Ok(NewCollectionResponse {
            id: collection_config.id,
            description: collection_config.description,
            read_api_key: collection_config.read_api_key,
            write_api_key: collection_config.write_api_key,
        })
    }

    pub fn list_collections(&self) -> Result<Vec<ExistingCollection>, Box<dyn std::error::Error>> {
        let url = format!("{}/v1/collections", self.url);
        let response = reqwest::blocking::Client::new()
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.master_api_key))
            .send()?
            .text()?;

        let response: Vec<ExistingCollection> = serde_json::from_str(&response)?;

        Ok(response)
    }

    pub fn get_collection(
        &self,
        id: String,
    ) -> Result<ExistingCollection, Box<dyn std::error::Error>> {
        let url = format!("{}/v1/collections/{}", self.url, id);
        let response = reqwest::blocking::Client::new()
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.master_api_key))
            .send()?
            .text()?;

        let response: ExistingCollection = serde_json::from_str(&response)?;

        dbg!(response.clone());

        Ok(response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::internal::nlp::Language;

    fn get_manager() -> OramaCoreManager {
        OramaCoreManager::new(
            "http://localhost:8080".to_string(),
            "my-master-api-key".to_string(),
        )
    }

    #[test]
    fn test_create_collection_with_defaults() {
        let manager = get_manager();
        let id = gen_random_string(10);

        let collection_config = NewCollectionParams {
            id: id.clone(),
            ..Default::default()
        };

        let response = manager.create_collection(collection_config).unwrap();

        assert_eq!(response.id, id);
        assert_eq!(response.description, None);
        assert_eq!(response.read_api_key.len(), RAND_API_KEY_LENGTH);
        assert_eq!(response.write_api_key.len(), RAND_API_KEY_LENGTH);
    }

    #[test]
    fn test_create_collection_with_config() {
        let manager = get_manager();
        let id = gen_random_string(10);

        let collection_config = NewCollectionParams {
            id: id.clone(),
            description: Some("My random description".to_string()),
            embeddings: Some(EmbeddingsConfig {
                document_fields: Some(vec!["title".to_string(), "content".to_string()]),
                model: Some(EmbeddingModel::E5MultilangualLarge),
            }),
            language: Some(Language::Italian),
            read_api_key: "read".to_string(),
            write_api_key: "write".to_string(),
        };

        let response = manager.create_collection(collection_config).unwrap();

        assert_eq!(response.id, id);
        assert_eq!(
            response.description,
            Some("My random description".to_string())
        );
        assert_eq!(response.read_api_key, "read".to_string());
        assert_eq!(response.write_api_key, "write".to_string());
    }

    #[test]
    fn test_list_collections() {
        let manager = get_manager();
        let collections = manager.list_collections().unwrap();

        assert_eq!(collections.len() > 1, true);
    }

    #[test]
    fn test_get_collection() {
        let manager = get_manager();
        let collections = manager.list_collections().unwrap();

        let collection = manager.get_collection(collections[0].id.clone()).unwrap();

        assert_eq!(collection.id, collections[0].id);
    }
}
