//! GitHub REST client for Appa.
//!
//! Read-only by design: Appa pulls PRs, diffs, checks, reviews and
//! comments from GitHub but never writes anything back. Review comments
//! stay local (see `appa-core::review`).

pub mod auth;
pub mod client;
mod wire;

pub use auth::{GithubAuth, GithubConfig};
pub use client::GithubClient;
