use rand::{distr::Alphanumeric, Rng};
use serde::Serialize;

pub fn gen_random_string(len: usize) -> String {
    rand::rng()
        .sample_iter(Alphanumeric)
        .take(len)
        .map(char::from)
        .collect()
}
