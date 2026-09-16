//! GitHub REST client for Appa.
//!
//! Reads power the whole app. Writes exist ONLY for explicit user
//! actions (post a chosen comment / approve); agents never get a path
//! to them and review comments stay local by default.

pub mod auth;
pub mod client;
mod wire;

pub use auth::{GithubAuth, GithubConfig};
pub use client::{GithubClient, NewInlineComment};
