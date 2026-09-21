//! Account/repo discovery + collaborator lookups (repo browser and
//! @people autocomplete).

use tandem_core::github::RepoRef;
use tandem_core::Result;

use crate::client::GithubClient;
use crate::wire::RepoSummary;

impl GithubClient {
    /// Collaborator logins for a repo (used for @people autocomplete).
    /// Listing needs push access on some repos — callers treat failure
    /// as "no extra names", not an error.
    pub async fn list_collaborators(&self, repo: &RepoRef) -> Result<Vec<String>> {
        #[derive(serde::Deserialize)]
        struct Collaborator {
            login: String,
        }
        let people: Vec<Collaborator> = self
            .get_json(&format!(
                "/repos/{}/{}/collaborators?per_page=100",
                repo.owner, repo.name
            ))
            .await?;
        Ok(people.into_iter().map(|c| c.login).collect())
    }

    /// Login of the authenticated user (used to seed the repo browser).
    pub async fn viewer_login(&self) -> Result<String> {
        #[derive(serde::Deserialize)]
        struct Viewer {
            login: String,
        }
        let v: Viewer = self.get_json("/user").await?;
        Ok(v.login)
    }

    /// Organizations the authenticated user belongs to.
    pub async fn list_orgs(&self) -> Result<Vec<String>> {
        #[derive(serde::Deserialize)]
        struct Org {
            login: String,
        }
        let orgs: Vec<Org> = self.get_json("/user/orgs?per_page=100").await?;
        Ok(orgs.into_iter().map(|o| o.login).collect())
    }

    /// Repos for an owner, most recently pushed first. `viewer` selects
    /// the authenticated-user endpoint (which includes private repos).
    pub async fn list_owner_repos(&self, owner: &str, viewer: bool) -> Result<Vec<RepoSummary>> {
        let path = if viewer {
            "/user/repos?per_page=100&sort=pushed&affiliation=owner".to_owned()
        } else {
            format!("/orgs/{owner}/repos?per_page=100&sort=pushed")
        };
        self.get_json(&path).await
    }
}
