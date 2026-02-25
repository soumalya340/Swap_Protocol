# Raydium Pool Swap Protocol

A Solana program that acts as a proxy wrapper around Raydium's CPMM (Constant Product Market Maker) swap protocol, enabling custom admin fee collection on swaps.

## Project Overview

This project implements a Solana Anchor program that interfaces with Raydium's CPMM swap program via Cross-Program Invocation (CPI). It allows pool initialization and token swaps while collecting custom admin fees on both input and output tokens.

## Source Files (`programs/raydium_pool/src/`)

### `lib.rs`

The main program entry point that declares the program ID and exposes all instruction handlers.

**Key Functions:**

- `init_config`: Initializes the target configuration with an admin key
- `update_config`: Updates the target configuration admin key
- `proxy_initialize`: Proxies pool initialization to Raydium CPMM
- `proxy_swap_base_input`: Proxies swaps with admin fee collection on both input and output
- `swap`: Performs swaps with admin fee collection on input only

**Program ID:** `D42KWzJLEX3suTfsxF2iPwxoFdza9DH6BynZMeRcY6mT`

### `instructions/mod.rs`

Module declaration file that exports all instruction modules:

- `init_config`
- `proxy_initialize`
- `proxy_swap_base_input`
- `swap`

### `instructions/init_config.rs`

Handles initialization and updates of the target configuration account.

**Key Functions:**

- `initialize_config`: Creates a new `TargetConfig` account with an admin key
  - Requires the caller to be the default admin (`AVc4qQbe4mtPAa7DWBm98AGwWHoPSzfx3rWgruhB677z`)
  - Creates a PDA account with seed `"config"`
- `update_config`: Updates the admin key in an existing `TargetConfig` account
  - Also requires default admin authorization

**Account Structure:**

- `TargetConfig`: Stores the admin public key
  - PDA seed: `b"config"`
  - Space: 8 bytes (discriminator) + 32 bytes (Pubkey)

**Error Codes:**

- `NotAdmin`: Thrown when caller is not the default admin

### `instructions/proxy_initialize.rs`

Proxies the pool initialization to Raydium's CPMM swap program via CPI.

**Key Function:**

- `proxy_initialize`: Creates a new liquidity pool on Raydium CPMM
  - Takes `init_amount_0` and `init_amount_1` as initial liquidity amounts
  - Derives all necessary PDAs (pool state, LP mint, vaults, observation state)
  - Calls Raydium's `initialize` instruction with current timestamp as `open_time`

**Account Structure:**

- `ProxyInitialize`: Contains all accounts needed for pool initialization
  - Creator accounts (token accounts for both tokens, LP token account)
  - Raydium program accounts (pool state, LP mint, vaults, authority, observation state)
  - AMM config and create pool fee account

**Constraints:**

- `token_0_mint` must be lexicographically smaller than `token_1_mint`

### `instructions/proxy_swap_base_input.rs`

Proxies swaps to Raydium CPMM while collecting admin fees on both input and output tokens.

**Key Function:**

- `proxy_swap_base_input`: Executes a swap with custom fee collection
  - Calculates input fee from `amount_in` using `input_fee_bps` (basis points)
  - Transfers input fee to admin before swap
  - Executes swap via Raydium CPI with reduced input amount
  - Calculates output fee from actual output received using `output_fee_bps`
  - Transfers output fee to admin after swap

**Account Structure:**

- `ProxySwapBaseInput`: Contains swap accounts and admin fee accounts
  - Requires admin signature for authorization
  - Validates admin key matches `TargetConfig`
  - Includes all Raydium swap accounts (pool state, vaults, observation state)

**Error Codes:**

- `InsufficientAmount`: Thrown when amount after fees is insufficient
- `CalculationFailure`: Thrown on fee calculation overflow
- `UnauthorizedAdmin`: Thrown when admin signature doesn't match config

### `instructions/swap.rs`

Performs swaps with admin fee collection on input tokens only.

**Key Function:**

- `swap`: Executes a swap with input fee collection
  - Similar to `proxy_swap_base_input` but only collects fees on input
  - Calculates input fee from `amount_in` using `input_fee_bps`
  - Transfers fee to admin before executing swap
  - No output fee collection

**Account Structure:**

- `Swap`: Similar to `ProxySwapBaseInput` but without output fee accounts
  - Requires admin signature
  - Validates admin key matches `TargetConfig`

**Error Codes:**

- Same as `proxy_swap_base_input`

## Library Files (`libs/raydium_cpmm/src/`)

### `lib.rs`

Wrapper library for interacting with Raydium's CPMM swap program.

**Key Features:**

- Uses `declare_program!` macro to generate Anchor IDL bindings for Raydium CPMM
- Re-exports account types: `AmmConfig`, `ObservationState`, `PoolState`
- Defines seed constants:
  - `OBSERVATION_SEED`: `"observation"`
  - `POOL_SEED`: `"pool"`
  - `POOL_LP_MINT_SEED`: `"pool_lp_mint"`
  - `POOL_VAULT_SEED`: `"pool_vault"`
  - `AUTH_SEED`: `"vault_and_lp_mint_auth_seed"`
- Provides `create_pool_fee_reveiver` module with mainnet fee receiver address

## Test Files (`tests/`)

### `raydium_pool.ts`

Comprehensive test suite for the Raydium Pool program using Anchor and Mocha.

**Test Structure:**

- Uses `@coral-xyz/anchor` for program interaction
- Uses `@raydium-io/raydium-sdk-v2` for pool state decoding
- Sets up test environment with funded keypairs (Alice, Bob)

**Key Test Cases:**

1. **Pool Initialization**: Tests `proxy_initialize` to create a Raydium pool

   - Wraps SOL to WSOL
   - Creates pool with initial liquidity
   - Verifies pool state creation

2. **Config Initialization**: Tests `init_config` and `update_config`

   - Creates target config with admin key
   - Updates admin key
   - Verifies admin key changes

3. **Swap SOL to Meme**: Tests `proxy_swap_base_input` with admin fees

   - Swaps WSOL for meme tokens
   - Collects fees on both input (1%) and output (0.1%)
   - Verifies admin receives fees

4. **Swap Meme to SOL**: Tests `swap` instruction

   - Swaps meme tokens back to WSOL
   - Collects fees on input only (1%)
   - Verifies swap execution

5. **Non-Admin Swap**: Tests swap for non-admin user (Bob)
   - Verifies regular users can swap
   - Confirms admin fees are still collected

**Helper Functions:**

- `createFundedKeypair`: Creates and funds test keypairs
- `userInfo`: Displays user token balances
- `poolSeedInfo`: Derives all Raydium pool PDAs
- `poolInfo`: Fetches and displays pool state
- `createTargetConfig`: Helper to create config if not exists

### `config.ts`

Configuration file containing Raydium program addresses and constants.

**Exports:**

- `cpSwapProgram`: Raydium CPMM program ID (`CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`)
- `createPoolFee`: Create pool fee receiver address (`DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8`)
- `ammConfig`: AMM configuration address for 2% fee (`D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2`)
- `QUOTE_MINT`: Native mint (WSOL) constant

### `utils.ts`

Utility functions for token operations and account management.

**Key Functions:**

- `createMemeMint`: Creates a new SPL token mint for testing

  - Generates keypair, creates mint with 9 decimals
  - Mints 100M tokens to creator
  - Saves mint address to `PublicKey.json`

- `wrapSol`: Wraps SOL to WSOL (Wrapped SOL)

  - Creates or gets associated token account for NATIVE_MINT
  - Transfers SOL and syncs native account
  - Returns WSOL token account address

- `getTargetConfigPda`: Derives the target config PDA

  - Uses seed `"config"` and program ID

- `getPoolAddress`: Derives Raydium pool state PDA

  - Uses seeds: `"pool"`, `ammConfig`, `token0Mint`, `token1Mint`

- `getAllTokens`: Lists all token accounts for a wallet (for debugging)

## Program Download and Usage (`package.json`)

### Dependencies

**Production Dependencies:**

- `@coral-xyz/anchor`: `^0.31.0` - Anchor framework for Solana program development
- `@raydium-io/raydium-sdk-v2`: `^0.2.30-alpha` - Raydium SDK for pool state decoding and utilities
- `@solana/spl-token`: `^0.4.14` - SPL Token program for token operations

**Development Dependencies:**

- `@types/bn.js`, `@types/chai`, `@types/mocha` - TypeScript type definitions
- `chai`: `^4.3.4` - Assertion library
- `mocha`: `^9.0.3` - Test framework
- `ts-mocha`: `^10.0.0` - TypeScript support for Mocha
- `typescript`: `^5.7.3` - TypeScript compiler
- `prettier`: `^2.6.2` - Code formatter

### Scripts

1. **`npm run build`** or **`yarn build`**

   - Runs `anchor build`
   - Compiles the Solana program to BPF bytecode
   - Generates IDL (Interface Definition Language) files
   - Outputs: `target/deploy/raydium_pool.so` and `target/idl/raydium_pool.json`

2. **`npm run test`** or **`yarn test`**

   - Runs `anchor test --skip-local-validator`
   - Executes test suite without starting a local validator
   - Assumes validator is already running (via `validator` script)

3. **`npm run validator`** or **`yarn validator`**
   - Starts `solana-test-validator` with:
     - Raydium CPMM program loaded: `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`
     - Program binary: `tests/programs/raydium-cpmm.so`
     - Cloned accounts from mainnet:
       - `D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2` (AMM Config)
       - `DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8` (Create Pool Fee)
     - Uses mainnet-beta URL for account cloning

### How Programs Are Downloaded

1. **Raydium CPMM Program:**

   - The Raydium CPMM program binary (`raydium-cpmm.so`) must be placed in `tests/programs/`
   - This binary is loaded by the test validator via the `validator` script
   - The program ID `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` is hardcoded in the validator command

2. **Raydium Pool Program:**

   - Built locally using `anchor build`
   - The program ID is declared in `lib.rs`: `D42KWzJLEX3suTfsxF2iPwxoFdza9DH6BynZMeRcY6mT`
   - Deployed to the validator during `anchor test` or manually via `anchor deploy`

3. **Account Cloning:**
   - The validator script clones mainnet accounts using `--clone` flags
   - This allows testing with real Raydium configuration accounts without deploying them
   - Cloned accounts include AMM config and fee receiver addresses

### Installation

```bash
# Install dependencies
npm install
# or
yarn install

# Build the program
npm run build

# Start test validator (in one terminal)
npm run validator

# Run tests (in another terminal)
npm run test
```


```
Swap_Protocol/
├── programs/
│   └── raydium_pool/
│       └── src/
│           ├── lib.rs                    # Main program entry point
│           └── instructions/
│               ├── mod.rs                # Instruction module exports
│               ├── init_config.rs        # Config initialization
│               ├── proxy_initialize.rs    # Pool initialization proxy
│               ├── proxy_swap_base_input.rs # Swap with dual fees
│               └── swap.rs               # Swap with input fees only
├── libs/
│   └── raydium_cpmm/
│       └── src/
│           └── lib.rs                    # Raydium CPMM wrapper
├── tests/
│   ├── raydium_pool.ts                   # Main test suite
│   ├── config.ts                         # Configuration constants
│   ├── utils.ts                          # Utility functions
│   └── programs/
│       └── raydium-cpmm.so               # Raydium CPMM binary
├── package.json                          # Node.js dependencies and scripts
├── Anchor.toml                           # Anchor configuration
└── READEME.md                            # This file
```

## Key Features

1. **Pool Initialization**: Proxy wrapper for creating Raydium CPMM pools
2. **Admin Fee Collection**: Custom fee collection on swaps (configurable basis points)
3. **Dual Fee Support**: Collect fees on both input and output tokens
4. **Admin Authorization**: Config-based admin key management
5. **Raydium Integration**: Seamless CPI integration with Raydium's CPMM program

## Notes

- The program requires Raydium CPMM program to be deployed/loaded in the test environment
- Admin operations require the default admin key: `AVc4qQbe4mtPAa7DWBm98AGwWHoPSzfx3rWgruhB677z`
- Fee amounts are specified in basis points (100 = 1%, 1000 = 10%)
- Token mints must be ordered lexicographically (token0 < token1) for pool creation
