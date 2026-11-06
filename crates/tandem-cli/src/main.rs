//! `tandem-cli` — read Tandem's local store from a script or an agent.
//!
//! Tandem keeps everything in one SQLite file with no server in front
//! of it, which makes "just read the file" the integration path. This
//! is that path with the paths, table names and JSON digging already
//! done, and it opens the database READ-ONLY: a tool that can only
//! read can't corrupt a review you're in the middle of.

use std::path::PathBuf;

use clap::{Parser, Subcommand};
use rusqlite::{Connection, OpenFlags};

mod query;
mod update;

#[derive(Parser)]
#[command(
    name = "tandem-cli",
    about = "Read Tandem's local review data",
    version
)]
struct Cli {
    /// Database to read. Defaults to $TANDEM_DB, else the installed
    /// app's store.
    #[arg(long, global = true)]
    db: Option<PathBuf>,
    /// Read the `make dev` store instead of the installed app's.
    #[arg(long, global = true)]
    dev: bool,
    /// Indent the JSON.
    #[arg(long, global = true)]
    pretty: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Where the data lives: database, run logs, settings.
    Paths,
    /// Cached pull requests, newest first.
    Prs {
        /// Only this repo, as owner/name.
        #[arg(long)]
        repo: Option<String>,
        #[arg(long, default_value_t = 50)]
        limit: u32,
    },
    /// Local review comments for one PR, oldest first.
    Comments {
        #[arg(long)]
        repo: String,
        #[arg(long)]
        pr: u64,
        /// Nest replies under their root instead of a flat list.
        #[arg(long)]
        threads: bool,
    },
    /// The agent's PR summary, if one has been written.
    Summary {
        #[arg(long)]
        repo: String,
        #[arg(long)]
        pr: u64,
    },
    /// PRs waiting on your review that no agent has reviewed yet —
    /// the question a scheduled job asks.
    Queue {
        /// Include ones a review has already been queued for.
        #[arg(long)]
        all: bool,
    },
    /// Ask Tandem to review a PR. Tandem starts it with your agent
    /// config; this only records the request.
    Review {
        #[arg(long)]
        repo: String,
        #[arg(long)]
        pr: u64,
        /// Which agent. Defaults to Tandem's first configured one.
        #[arg(long)]
        agent: Option<String>,
        /// Who asked, for the record.
        #[arg(long, default_value = "tandem-cli")]
        by: String,
    },
    /// Check for a newer Tandem, or install it.
    Update {
        /// Report versions and stop.
        #[arg(long)]
        check: bool,
    },
    /// Agent runs, newest first.
    Runs {
        #[arg(long)]
        repo: Option<String>,
        #[arg(long)]
        pr: Option<u64>,
        #[arg(long, default_value_t = 20)]
        limit: u32,
    },
}

/// Mirrors the app's own directory choice, including the separate
/// `tandem-dev` store a `make dev` run uses.
fn default_db(dev: bool) -> Option<PathBuf> {
    let name = if dev { "tandem-dev" } else { "tandem" };
    Some(dirs::data_dir()?.join(name).join("cache.sqlite3"))
}

fn resolve_db(cli: &Cli) -> Result<PathBuf, String> {
    if let Some(path) = &cli.db {
        return Ok(path.clone());
    }
    if let Ok(env) = std::env::var("TANDEM_DB") {
        if !env.is_empty() {
            return Ok(PathBuf::from(env));
        }
    }
    default_db(cli.dev).ok_or_else(|| "no data directory on this platform".to_owned())
}

fn main() {
    let cli = Cli::parse();
    if let Err(message) = run(&cli) {
        eprintln!("tandem-cli: {message}");
        std::process::exit(1);
    }
}

fn run(cli: &Cli) -> Result<(), String> {
    // Updating touches the network and this binary, never the store.
    if let Command::Update { check } = cli.command {
        let value = if check {
            update::check()?
        } else {
            update::perform()?
        };
        query::print(&value, cli.pretty);
        return Ok(());
    }

    let db = resolve_db(cli)?;
    if matches!(cli.command, Command::Paths) {
        return query::paths(&db, cli.pretty);
    }
    if !db.exists() {
        return Err(format!(
            "no database at {} — open Tandem once, or pass --db",
            db.display()
        ));
    }
    // Read-only, and SQLITE_OPEN_URI off: this never creates, migrates
    // or writes. Tandem's WAL mode means the app can stay open.
    let conn = Connection::open_with_flags(&db, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("can't open {}: {e}", db.display()))?;

    // The one command that writes: it records a request, it does not
    // touch review data. Everything else stays read-only.
    if let Command::Review {
        repo,
        pr,
        agent,
        by,
    } = &cli.command
    {
        let value = query::request_review(&db, repo, *pr, agent.as_deref(), by)?;
        query::print(&value, cli.pretty);
        return Ok(());
    }

    let value = match &cli.command {
        Command::Paths => unreachable!("handled above"),
        Command::Review { .. } | Command::Update { .. } => unreachable!("handled above"),
        Command::Queue { all } => query::queue(&conn, *all)?,
        Command::Prs { repo, limit } => query::prs(&conn, repo.as_deref(), *limit)?,
        Command::Comments { repo, pr, threads } => query::comments(&conn, repo, *pr, *threads)?,
        Command::Summary { repo, pr } => query::summary(&conn, repo, *pr)?,
        Command::Runs { repo, pr, limit } => query::runs(&conn, repo.as_deref(), *pr, *limit)?,
    };
    query::print(&value, cli.pretty);
    Ok(())
}
