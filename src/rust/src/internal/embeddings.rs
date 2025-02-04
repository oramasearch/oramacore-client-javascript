use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub enum EmbeddingModel {
    E5MultilangualSmall,
    E5MultilangualBase,
    E5MultilangualLarge,
    BGESmall,
    BGEBase,
    BGELarge,
}
