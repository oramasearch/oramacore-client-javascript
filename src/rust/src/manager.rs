use std::collections::HashMap;

use crate::{embeddings::EmbeddingModel, nlp::Language, utils::gen_random_string};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct OramaCoreManager {
    url: String,
    master_api_key: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct NewCollectionParams {
    id: String,
    description: Option<String>,
    write_api_key: String,
    read_api_key: String,
    language: Option<Language>,
    embeddings: Option<EmbeddingsConfig>,
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
            write_api_key: gen_random_string(32),
            read_api_key: gen_random_string(32),
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

        Ok(response)
    }

    pub fn delete_collection(&self, id: String) -> Result<(), Box<dyn std::error::Error>> {
        let url = format!("{}/v1/collections/{}/delete", self.url, id);
        let _ = reqwest::blocking::Client::new()
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.master_api_key))
            .send()?;

        Ok(())
    }
}
