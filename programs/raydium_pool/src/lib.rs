use anchor_lang::prelude::*;

pub mod instructions;
use instructions::*;

declare_id!("jfFkhbGTopncgwuT2ER66MN8dqgpNuNm958rRquM9bi");

#[program]
pub mod raydium_pool {
    use super::*;

    pub fn init_config(
        ctx: Context<InitTargetConfig>,
        input_fee_amount: u64,
        output_fee_amount: u64,
        admin_key: Pubkey,
    ) -> Result<()> {
        instructions::init_config::initialize_config(
            ctx,
            input_fee_amount,
            output_fee_amount,
            admin_key,
        )
    }

    pub fn update_config(
        ctx: Context<UpdateTargetConfig>,
        admin_key: Pubkey,
        input_fee_amount: u64,
        output_fee_amount: u64,
    ) -> Result<()> {
        instructions::init_config::update_config(
            ctx,
            admin_key,
            input_fee_amount,
            output_fee_amount,
        )
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
    ) -> Result<()> {
        instructions::proxy_swap_base_input::proxy_swap_base_input(
            ctx,
            amount_in,
            minimum_amount_out,
        )
    }

    pub fn swap(ctx: Context<Swap>, amount_in: u64, minimum_amount_out: u64) -> Result<()> {
        instructions::swap::swap(ctx, amount_in, minimum_amount_out)
    }
}
