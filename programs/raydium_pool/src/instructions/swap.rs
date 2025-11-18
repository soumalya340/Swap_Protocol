use crate::instructions::init_config::TargetConfig;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked};
use raydium_cp_swap::{
    cpi,
    program::RaydiumCpSwap,
    states::{AmmConfig, ObservationState, PoolState},
};

impl<'info> Swap<'info> {
    /// Helper function to create CPI context for transferring input token fees to admin
    fn send_input_fees_to_admin(&self) -> CpiContext<'_, '_, '_, 'info, TransferChecked<'info>> {
        let cpi_accounts = TransferChecked {
            from: self.input_token_account.to_account_info(),
            mint: self.input_token_mint.to_account_info(),
            to: self.admin_input_token_account.to_account_info(),
            authority: self.payer.to_account_info(),
        };
        let cpi_program = self.input_token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

pub fn swap(
    ctx: Context<Swap>,
    amount_in: u64,
    minimum_amount_out: u64,
    input_fee_bps: u64, // Fee in basis points (e.g., 100 = 1%)
) -> Result<()> {
    // Calculate base token fee using passed parameter
    let input_fee_amount = (amount_in as u128)
        .checked_mul(input_fee_bps as u128)
        .and_then(|product| product.checked_div(10000))
        .and_then(|result| result.try_into().ok())
        .ok_or(error!(Error::CalculationFailure))?;

    // Calculate actual input amount after fees
    let actual_amount_in = amount_in
        .checked_sub(input_fee_amount)
        .ok_or(error!(Error::InsufficientAmount))?;

    if input_fee_amount > 0 {
        anchor_spl::token_interface::transfer_checked(
            ctx.accounts.send_input_fees_to_admin(),
            input_fee_amount,
            ctx.accounts.input_token_mint.decimals,
        )?;

        msg!(
            "✅ Transferred {} input token fees to admin",
            input_fee_amount
        );
    }
    // Store output token balance before swap
    // let output_balance_before = ctx.accounts.output_token_account.amount;

    // Perform the swap
    let cpi_accounts = cpi::accounts::SwapBaseInput {
        payer: ctx.accounts.payer.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
        amm_config: ctx.accounts.amm_config.to_account_info(),
        pool_state: ctx.accounts.pool_state.to_account_info(),
        input_token_account: ctx.accounts.input_token_account.to_account_info(),
        output_token_account: ctx.accounts.output_token_account.to_account_info(),
        input_vault: ctx.accounts.input_vault.to_account_info(),
        output_vault: ctx.accounts.output_vault.to_account_info(),
        input_token_program: ctx.accounts.input_token_program.to_account_info(),
        output_token_program: ctx.accounts.output_token_program.to_account_info(),
        input_token_mint: ctx.accounts.input_token_mint.to_account_info(),
        output_token_mint: ctx.accounts.output_token_mint.to_account_info(),
        observation_state: ctx.accounts.observation_state.to_account_info(),
    };
    let cpi_context = CpiContext::new(ctx.accounts.cp_swap_program.to_account_info(), cpi_accounts);

    // Execute swap
    cpi::swap_base_input(cpi_context, actual_amount_in, minimum_amount_out)?;

    Ok(())
}

#[derive(Accounts)]
pub struct Swap<'info> {
    pub cp_swap_program: Program<'info, RaydiumCpSwap>,

    /// The user performing the swap
    pub payer: Signer<'info>,

    /// Admin must sign to authorize the swap with specific fees
    #[account(
        constraint = admin.key() == target_config.admin_key @ Error::UnauthorizedAdmin
    )]
    pub admin: Signer<'info>,

    ///////////////////////// TARGET CONFIG ACCOUNT ///////////////////////
    /// The target configuration account containing fee settings
    #[account(
        seeds = [TargetConfig::CONFIG_PREFIX],
        bump
    )]
    pub target_config: Account<'info, TargetConfig>,

    /// Admin's token account to receive base token fees
    #[account(
        mut,
        constraint = admin_input_token_account.owner == target_config.admin_key
    )]
    pub admin_input_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Admin's token account to receive quote token fees
    #[account(
        mut,
        constraint = admin_output_token_account.owner == target_config.admin_key
    )]
    pub admin_output_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    ///////////////////////// RAYDIUM CPI ACCOUNTS ///////////////////////
    /// CHECK: pool vault and lp mint authority
    #[account(
        seeds = [
            raydium_cp_swap::AUTH_SEED.as_bytes(),
        ],
        seeds::program = cp_swap_program.key(),
        bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// The factory state to read protocol fees
    #[account(address = pool_state.load()?.amm_config)]
    pub amm_config: Box<Account<'info, AmmConfig>>,

    /// The program account of the pool in which the swap will be performed
    #[account(mut)]
    pub pool_state: AccountLoader<'info, PoolState>,

    /// The user token account for input token
    #[account(mut)]
    pub input_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The user token account for output token
    #[account(mut)]
    pub output_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The vault token account for input token
    #[account(
        mut,
        constraint = input_vault.key() == pool_state.load()?.token_0_vault || input_vault.key() == pool_state.load()?.token_1_vault
    )]
    pub input_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The vault token account for output token
    #[account(
        mut,
        constraint = output_vault.key() == pool_state.load()?.token_0_vault || output_vault.key() == pool_state.load()?.token_1_vault
    )]
    pub output_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// SPL program for input token transfers
    pub input_token_program: Interface<'info, TokenInterface>,

    /// SPL program for output token transfers  
    pub output_token_program: Interface<'info, TokenInterface>,

    /// The mint of input token
    #[account(
        address = input_vault.mint
    )]
    pub input_token_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The mint of output token
    #[account(
        address = output_vault.mint
    )]
    pub output_token_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The program account for the most recent oracle observation
    #[account(mut, address = pool_state.load()?.observation_key)]
    pub observation_state: AccountLoader<'info, ObservationState>,
}

#[error_code]
pub enum Error {
    #[msg("Insufficient amount for swap after fees")]
    InsufficientAmount,
    #[msg("Fee calculation failed due to overflow or conversion error")]
    CalculationFailure,
    #[msg("Unauthorized: Only admin can execute this swap")]
    UnauthorizedAdmin,
}
