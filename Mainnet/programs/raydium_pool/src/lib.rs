use anchor_lang::prelude::*;

pub mod instructions;
use instructions::*;

declare_id!("Fr1qyT8FjXAxPVc5cx2o2MfgCrchTVcWqUW716yrjZmW");

#[program]
pub mod raydium_pool {
    use super::*;

    pub fn init_config(ctx: Context<InitTargetConfig>, admin_key: Pubkey) -> Result<()> {
        instructions::init_config::initialize_config(ctx, admin_key)
    }

    pub fn update_config(ctx: Context<UpdateTargetConfig>, admin_key: Pubkey) -> Result<()> {
        instructions::init_config::update_config(ctx, admin_key)
    }
    pub fn proxy_initialize(
        ctx: Context<ProxyInitialize>,
        init_amount_0: u64,
        init_amount_1: u64,
    ) -> Result<()> {
        instructions::proxy_initialize(ctx, init_amount_0, init_amount_1)
    }

    pub fn proxy_swap_base_input(
        ctx: Context<ProxySwapBaseInput>,
        amount_in: u64,
        minimum_amount_out: u64,
        input_fee_bps: u64,
        output_fee_bps: u64,
    ) -> Result<()> {
        instructions::proxy_swap_base_input::proxy_swap_base_input(
            ctx,
            amount_in,
            minimum_amount_out,
            input_fee_bps,
            output_fee_bps,
        )
    }

    pub fn swap(
        ctx: Context<Swap>,
        amount_in: u64,
        minimum_amount_out: u64,
        input_fee_bps: u64,
    ) -> Result<()> {
        instructions::swap::swap(ctx, amount_in, minimum_amount_out, input_fee_bps)
    }
}
