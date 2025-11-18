use anchor_lang::prelude::*;

pub const ANCHOR_DISCRIMINATOR: usize = 8;
pub const DEFAULT_ADMIN_KEY: Pubkey =
    anchor_lang::solana_program::pubkey!("AVc4qQbe4mtPAa7DWBm98AGwWHoPSzfx3rWgruhB677z");

/// Handles the initialization of a target configuration.
/// This function creates a new target configuration account with the specified
/// fee amounts and sets the creator as the admin.
///
/// # Parameters
/// * `ctx` - The context containing all necessary accounts
/// * `admin_key` - The key of the admin who will be the owner of the target config
pub fn initialize_config(ctx: Context<InitTargetConfig>, admin_key: Pubkey) -> Result<()> {
    msg!("InitTargetConfig");

    let target_config = &mut ctx.accounts.target_config;

    target_config.admin_key = admin_key;

    Ok(())
}

pub fn update_config(ctx: Context<UpdateTargetConfig>, admin_key: Pubkey) -> Result<()> {
    msg!("UpdateTargetConfig");

    let target_config = &mut ctx.accounts.target_config;

    target_config.admin_key = admin_key;

    Ok(())
}

/// Represents the accounts required for initializing a target configuration.
///
/// This struct defines the accounts needed for the `init_target_config` instruction.
/// It includes the admin signer, the target config account to be created,
/// the token mint, and the system program.
#[derive(Accounts)]
pub struct InitTargetConfig<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        init,
        payer = caller,
        space = ANCHOR_DISCRIMINATOR + TargetConfig::INIT_SPACE,
        seeds = [TargetConfig::CONFIG_PREFIX],
        bump,
        constraint = caller.key() == DEFAULT_ADMIN_KEY @ErrorCode::NotAdmin

    )]
    /// The target configuration account being created
    pub target_config: Account<'info, TargetConfig>,

    /// The system program for account creation
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateTargetConfig<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(mut,
        constraint = caller.key() == DEFAULT_ADMIN_KEY @ErrorCode::NotAdmin,
        seeds = [TargetConfig::CONFIG_PREFIX],
        bump
    )]
    pub target_config: Account<'info, TargetConfig>,
}

#[account]
#[derive(InitSpace)]
pub struct TargetConfig {
    pub admin_key: Pubkey,
}

impl TargetConfig {
    pub const CONFIG_PREFIX: &'static [u8; 6] = b"config";
}

#[error_code]
pub enum ErrorCode {
    #[msg("Caller is not the default admin")]
    NotAdmin,
}
