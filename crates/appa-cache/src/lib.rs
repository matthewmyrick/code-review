//! Local SQLite cache for Appa.
//!
//! The UI always renders from this cache first, then background syncs
//! refresh it — that's what makes the app feel instant. It also owns the
//! data GitHub never sees: local review comments, agent specs and runs.
//!
//! Values are stored as JSON blobs with indexed key columns. That trades
//! some queryability for schema flexibility, which is the right call
//! while the domain types are still moving.

mod archive;
mod review_store;
mod schema;
mod store;

pub use archive::{purge_deadline, ArchiveStore};
pub use review_store::ReviewStore;
pub use store::Cache;
