import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { RaydiumPool } from "../target/types/raydium_pool";
import {
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  getAccount,
  NATIVE_MINT,
} from "@solana/spl-token";
import {
  createMemeMint,
  wrapSol,
  LAMPORTS_PER_SOL,
  getPoolAddress,
  getTargetConfigPda,
} from "./utils";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { ammConfig, cpSwapProgram, createPoolFee } from "./config";
import { CpmmPoolInfoLayout } from "@raydium-io/raydium-sdk-v2";
import bs58 from "bs58";
import * as fs from "fs";

describe("Raydium Pool", () => {
  let alice: Keypair;
  let bob: Keypair;
  let targetConfig: PublicKey;
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.RaydiumPool as Program<RaydiumPool>; // Set up provider and program

  const user = provider.wallet;
  const payer = (user as any).payer;

  // Reusable function to create and fund a keypair
  async function createFundedKeypair(amountInSol = 2) {
    // Generate a random keypair
    const keypair = Keypair.generate();

    const airdropAmount = amountInSol * LAMPORTS_PER_SOL;
    const airdropTx = await provider.connection.requestAirdrop(
      keypair.publicKey,
      airdropAmount
    );
    await provider.connection.confirmTransaction(airdropTx);
    // Return the funded keypair
    return keypair;
  }

  // Test configuration
  let memeMint: PublicKey;
  const confirmOptions = {
    skipPreflight: true,
  };

  // Helper function to format balance in millions
  function formatBalanceInMillions(balance: number): string {
    const millions = balance / 1_000_000;
    if (millions >= 1) {
      return `${
        millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)
      }M`;
    } else {
      return `${millions.toFixed(1)}M`;
    }
  }

  async function userInfo(
    connection: any,
    wallet: any,
    token0Mint: any,
    token1Mint: any,
    userName: string = "User",
    isFormatNeeded: boolean = true
  ) {
    const userToken1Account = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      token1Mint,
      wallet.publicKey
    );
    // 2. Get the user's quote token account (user_quote)

    const userToken0Account = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      token0Mint,
      wallet.publicKey
    );

    const userMemeBalanceAmount =
      Number(userToken1Account.amount) / LAMPORTS_PER_SOL;

    let formattedMemeBalance;
    if (isFormatNeeded) {
      formattedMemeBalance = formatBalanceInMillions(userMemeBalanceAmount);
    }

    console.log(`${userName} Wallet Meme balance: ${formattedMemeBalance}`);

    const userQuoteBalanceAmount =
      Number(userToken0Account.amount) / LAMPORTS_PER_SOL;

    console.log(
      `${userName} Wallet Quote balance: ${userQuoteBalanceAmount} WSOL`
    );

    return {
      userToken0Account,
      userToken1Account,
    };
  }

  async function poolSeedInfo(payer: any, token0Mint: any, token1Mint: any) {
    // Derive Raydium Authority PDA
    const POOL_AUTH_SEED = Buffer.from(
      anchor.utils.bytes.utf8.encode("vault_and_lp_mint_auth_seed")
    );
    const [raydiumAuthority] = PublicKey.findProgramAddressSync(
      [POOL_AUTH_SEED],
      cpSwapProgram
    );
    // Derive Raydium Pool State PDA
    const POOL_SEED = Buffer.from(anchor.utils.bytes.utf8.encode("pool"));

    const [raydiumPoolState] = PublicKey.findProgramAddressSync(
      [
        POOL_SEED,
        ammConfig.toBuffer(),
        token0Mint.toBuffer(), // token_0
        token1Mint.toBuffer(), // token_1
      ],
      cpSwapProgram
    );
    // Derive Raydium LP Mint PDA
    const POOL_LPMINT_SEED = Buffer.from(
      anchor.utils.bytes.utf8.encode("pool_lp_mint")
    );
    const [raydiumLpMint] = PublicKey.findProgramAddressSync(
      [POOL_LPMINT_SEED, raydiumPoolState.toBuffer()],
      cpSwapProgram
    );
    // Derive Raydium Token Vaults
    const POOL_VAULT_SEED = Buffer.from(
      anchor.utils.bytes.utf8.encode("pool_vault")
    );
    const [token0Vault] = PublicKey.findProgramAddressSync(
      [POOL_VAULT_SEED, raydiumPoolState.toBuffer(), token0Mint.toBuffer()],
      cpSwapProgram
    );

    const [token1Vault] = PublicKey.findProgramAddressSync(
      [POOL_VAULT_SEED, raydiumPoolState.toBuffer(), token1Mint.toBuffer()],
      cpSwapProgram
    );

    // Derive Observation State PDA
    const ORACLE_SEED = Buffer.from(
      anchor.utils.bytes.utf8.encode("observation")
    );
    const [observationState] = PublicKey.findProgramAddressSync(
      [ORACLE_SEED, raydiumPoolState.toBuffer()],
      cpSwapProgram
    );

    // Creator LP Token Account (ATA) - derive address only, Raydium will create it
    const [creatorLpToken] = PublicKey.findProgramAddressSync(
      [
        payer.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        raydiumLpMint.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    return {
      creatorLpToken,
      raydiumAuthority,
      raydiumPoolState,
      raydiumLpMint,
      token0Vault,
      token1Vault,
      observationState,
    };
  }

  async function poolInfo(
    token0Mint: any,
    token1Mint: any,
    show: boolean = true
  ) {
    console.log("\n");
    // Get pool state
    const [poolAddress] = await getPoolAddress(
      ammConfig,
      token0Mint,
      token1Mint,
      cpSwapProgram
    );

    if (show) {
      const accountInfo = await program.provider.connection.getAccountInfo(
        poolAddress
      );

      if (!accountInfo) {
        throw new Error("Pool account not found after initialization");
      }
      const poolState = CpmmPoolInfoLayout.decode(accountInfo.data);
      const cpSwapPoolState = {
        ammConfig: poolState.configId.toBase58(),
        token0Mint: poolState.mintA.toBase58(),
        token0Program: poolState.mintProgramA.toBase58(),
        token1Mint: poolState.mintB.toBase58(),
        token1Program: poolState.mintProgramB.toBase58(),
      };

      console.log("Pool address:", poolAddress.toString());
      console.log("\n The Pool State:", cpSwapPoolState);
    }
    return poolAddress;
  }

  async function createTargetConfig() {
    try {
      console.log("Creating target config with admin fees...");
      const accountInfo = await program.provider.connection.getAccountInfo(
        targetConfig
      );
      if (!accountInfo) {
        const tx = await program.methods.initConfig(payer.publicKey).rpc();
        console.log("Transaction signature: ", tx);
      } else {
        console.log("Admin Already Exists");
      }
    } catch (error) {
      console.error("Error creating target config:", error);
      throw error;
    }
  }

  before(async () => {
    // Create funded keypairs for test users
    alice = await createFundedKeypair(100);
    bob = await createFundedKeypair(100);
    // Create meme mint
    memeMint = await createMemeMint();
    // Get target config PDA
    [targetConfig] = getTargetConfigPda(program);
  });

  it("Should initialize Raydium pool", async () => {
    const sender = user;
    const payer = (sender as any).payer;
    const connection = provider.connection;

    const token0Mint = NATIVE_MINT;
    const token1Mint = memeMint;

    const raydiumPool = await connection.getAccountInfo(cpSwapProgram);
    if (!raydiumPool) {
      throw new Error("Raydium pool not found");
    }
    const ammConfigAccount = await connection.getAccountInfo(ammConfig);
    if (!ammConfigAccount) {
      throw new Error("AMM config not found");
    }

    const create_pool_fee = await connection.getAccountInfo(createPoolFee);
    if (!create_pool_fee) {
      throw new Error("Create pool fee not found");
    }

    console.log("Starting pool initialization...");

    const { userToken0Account, userToken1Account } = await userInfo(
      connection,
      payer,
      token0Mint,
      token1Mint
    );

    // Create compute budget instruction to request more CUs
    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000, // Request 400k CUs (double the default)
    });

    const amountForLp = 10;
    await wrapSol(connection, payer, amountForLp);
    const amount0 = new BN(amountForLp * LAMPORTS_PER_SOL);
    const amount1 = await getAccount(connection, userToken1Account.address);

    const {
      creatorLpToken,
      raydiumAuthority,
      raydiumPoolState,
      raydiumLpMint,
      token0Vault,
      token1Vault,
      observationState,
    } = await poolSeedInfo(payer, token0Mint, token1Mint);

    // Build the initialization instruction
    const initializeIx = await program.methods
      .proxyInitialize(amount0, new BN(amount1.amount))
      .accounts({
        creator: payer.publicKey,
        ammConfig: ammConfig,
        token0Mint: token0Mint,
        token1Mint: token1Mint,
        creatorToken0: userToken0Account.address,
        creatorToken1: userToken1Account.address,
        creatorLpToken: creatorLpToken,
      })
      .rpc();

    // // Create transaction with both instructions
    // const transaction = new Transaction().add(computeBudgetIx, initializeIx);

    // // Send transaction with confirmOptions
    // const tx = await sendAndConfirmTransaction(
    //   connection,
    //   transaction,
    //   [payer],
    //   confirmOptions
    // // );
    console.log(
      "✅ Pool initialization successful! Transaction signature: ",
      initializeIx
    );
    await userInfo(connection, payer, token0Mint, token1Mint);
  });
  it("Should initialize target config with admin fees", async () => {
    // Set fee amounts in basis points

    try {
      console.log("Creating target config with admin fees...");

      const accountInfo = await program.provider.connection.getAccountInfo(
        targetConfig
      );
      if (!accountInfo) {
        const tx = await program.methods.initConfig(payer.publicKey).rpc();
        console.log("Transaction signature: ", tx);
      } else {
        console.log("Admin Already Exists");
      }
      const targetPda = await program.account.targetConfig.fetch(targetConfig);
      const { adminKey } = targetPda;
      console.log("Admin key: ", adminKey.toBase58());

      ///Update the target config with new admin fees

      console.log("Updating target config with new admin fees...");
      const newAmount = new BN(0);
      const tx = await program.methods.updateConfig(payer.publicKey).rpc();
      console.log("Transaction signature: ", tx);

      const targetPdaAfter = await program.account.targetConfig.fetch(
        targetConfig
      );
      const { adminKey: adminKeyAfter } = targetPdaAfter;

      console.log("Admin key: ", adminKeyAfter.toBase58(), "\n");
    } catch (error) {
      console.error("Error creating target config:", error);
      throw error;
    }
  });

  it("Should swap for Sol to Meme with admin fees", async () => {
    const sender = user;
    const admin = (sender as any).payer;
    const connection = provider.connection;

    const token0Mint = NATIVE_MINT;
    const token1Mint = memeMint;

    // First wrap some SOL and check token balances
    await wrapSol(connection, alice, 10); // Wrap 10 SOL

    const inputFeeBps = 1000; // 1%
    const outputFeeBps = 100; // 1%

    const poolAddress = await poolInfo(token0Mint, token1Mint, false);
    const {
      userToken0Account: adminToken0Account,
      userToken1Account: adminToken1Account,
    } = await userInfo(connection, admin, token0Mint, token1Mint, "Admin");

    const {
      userToken0Account: aliceToken0Account,
      userToken1Account: aliceToken1Account,
    } = await userInfo(connection, alice, token0Mint, token1Mint, "Alice");

    const { token0Vault, token1Vault, observationState } = await poolSeedInfo(
      admin,
      token0Mint,
      token1Mint
    );

    // Amount to swap (1 SOL)
    const amount_in = new BN(1 * LAMPORTS_PER_SOL);
    // Pool Balance for Sol
    let amount0 = await getAccount(connection, token0Vault);
    /// Pool Balance for Meme
    let amount1 = await getAccount(connection, token1Vault);

    console.log("Starting swap...");
    console.log("Input amount:", Number(amount_in) / LAMPORTS_PER_SOL, "SOL");
    console.log("WSOL balance:", Number(amount0.amount) / LAMPORTS_PER_SOL);
    console.log(
      "MEME balance:",
      formatBalanceInMillions(Number(amount1.amount) / LAMPORTS_PER_SOL)
    );

    // Build the swap instruction
    const swapIx = await program.methods
      .proxySwapBaseInput(
        amount_in,
        new BN(0),
        new BN(inputFeeBps),
        new BN(outputFeeBps)
      ) // amount_in and minimum_amount_out
      .accounts({
        // Pool accounts
        ammConfig: ammConfig,
        poolState: poolAddress,
        inputTokenAccount: aliceToken0Account.address,
        outputTokenAccount: aliceToken1Account.address,
        inputVault: token0Vault,
        outputVault: token1Vault,
        inputTokenProgram: TOKEN_PROGRAM_ID,
        outputTokenProgram: TOKEN_PROGRAM_ID,
        inputTokenMint: token0Mint,
        outputTokenMint: token1Mint,
        observationState: observationState,
        // Target config and admin fee accounts
        adminInputTokenAccount: adminToken0Account.address,
        adminOutputTokenAccount: adminToken1Account.address,
      })
      .accountsPartial({
        payer: alice.publicKey,
      })
      .signers([alice])
      .instruction();

    // Add compute budget instruction for more CUs
    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    // Create and send transaction
    const transaction = new Transaction().add(computeBudgetIx).add(swapIx);

    console.log("Sending swap transaction...");

    try {
      const swapTx = await sendAndConfirmTransaction(
        connection,
        transaction,
        [alice, admin],
        confirmOptions
      );

      console.log("✅ Swap successful! Transaction signature:", swapTx);

      let newAmount0 = await getAccount(connection, token0Vault);

      amount1 = await getAccount(connection, token1Vault);

      console.log("\n Ending swap for the Pool with:");
      console.log("WSOL Balance:", Number(amount0.amount) / LAMPORTS_PER_SOL);
      console.log(
        "MEME Balance:",
        formatBalanceInMillions(Number(amount1.amount) / LAMPORTS_PER_SOL)
      );

      let diff = Number(newAmount0.amount) - Number(amount0.amount);

      console.log(
        "Difference in WSOL Balance:",
        diff / LAMPORTS_PER_SOL,
        "WSOL"
      );

      await userInfo(connection, alice, token0Mint, token1Mint, "Alice");
      await userInfo(connection, payer, token0Mint, token1Mint, "Admin");
    } catch (error) {
      console.error("❌ Swap failed:", error);
      if (error.logs) {
        console.log("Error logs:", error.logs);
      }
      throw error;
    }
  });
  it("Should swap for Meme to SOL ", async () => {
    const sender = user;
    const admin = (sender as any).payer;
    const connection = provider.connection;

    await createTargetConfig();
    console.log("\nStarting swap for Meme to SOL...\n");

    const inputFeeBps = 100; // 1%

    const tokenMemeMint = memeMint;
    const tokenWsolMint = NATIVE_MINT;

    const vaultWsolMint = NATIVE_MINT;
    const vaultMemeMint = memeMint;

    const poolAddress = await poolInfo(tokenWsolMint, tokenMemeMint, false);
    const {
      userToken0Account: adminTokenMemeAccount,
      userToken1Account: adminTokenWsolAccount,
    } = await userInfo(
      connection,
      admin,
      tokenMemeMint,
      tokenWsolMint,
      "Admin"
    );

    const {
      userToken0Account: aliceTokenMemeAccount,
      userToken1Account: aliceTokenWsolAccount,
    } = await userInfo(
      connection,
      alice,
      tokenMemeMint,
      tokenWsolMint,
      "Alice"
    );

    const {
      token0Vault: tokenWsolVault,
      token1Vault: tokenMemeVault,
      observationState,
    } = await poolSeedInfo(payer, vaultWsolMint, vaultMemeMint);

    // Amount to swap (1 SOL)
    const amount_in = new BN(1000_000 * LAMPORTS_PER_SOL);

    let amount0 = await getAccount(connection, tokenWsolVault);

    let amount1 = await getAccount(connection, tokenMemeVault);
    console.log(3);

    console.log("Starting swap with:", {
      wsol_balance: Number(amount0.amount) / LAMPORTS_PER_SOL,
      meme_balance: formatBalanceInMillions(
        Number(amount1.amount) / LAMPORTS_PER_SOL
      ),
    });

    // // Build the swap instruction
    const swapIx = await program.methods
      .swap(amount_in, new BN(0), new BN(100)) // amount_in, minimum_amount_out, input_fee_bps
      .accounts({
        // Pool accounts
        ammConfig: ammConfig,
        poolState: poolAddress,
        inputTokenAccount: aliceTokenMemeAccount.address, // Meme token account
        outputTokenAccount: aliceTokenWsolAccount.address, // WSOL account
        inputVault: tokenMemeVault, // Meme vault
        outputVault: tokenWsolVault, // WSOL vault
        inputTokenProgram: TOKEN_PROGRAM_ID,
        outputTokenProgram: TOKEN_PROGRAM_ID,
        inputTokenMint: tokenMemeMint, // Meme mint
        outputTokenMint: tokenWsolMint, // WSOL mint
        observationState: observationState,
        // Admin fee accounts
        adminInputTokenAccount: adminTokenMemeAccount.address,
        adminOutputTokenAccount: adminTokenWsolAccount.address,
      })
      .accountsPartial({
        payer: alice.publicKey,
      })
      .signers([alice])
      .instruction();

    // Add compute budget instruction for more CUs
    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    // Create and send transaction
    const transaction = new Transaction().add(computeBudgetIx).add(swapIx);

    console.log("Sending swap transaction...");

    try {
      const swapTx = await sendAndConfirmTransaction(
        connection,
        transaction,
        [alice, admin],
        confirmOptions
      );

      console.log("✅ Swap successful! Transaction signature:", swapTx);

      amount0 = await getAccount(connection, tokenWsolVault);

      amount1 = await getAccount(connection, tokenMemeVault);

      console.log("Ending swap with:", {
        wsol_balance: Number(amount0.amount) / LAMPORTS_PER_SOL,
        meme_balance: formatBalanceInMillions(
          Number(amount1.amount) / LAMPORTS_PER_SOL
        ),
      });

      await userInfo(connection, alice, tokenWsolMint, tokenMemeMint, "Alice");
      const { userToken1Account: afterSwapAdminToken1Account } = await userInfo(
        connection,
        payer,
        tokenWsolMint,
        tokenMemeMint,
        "Admin"
      );
      console.log(
        "Admin Meme balance after swap: ",
        afterSwapAdminToken1Account.amount.toString()
      );
    } catch (error) {
      console.error("❌ Swap failed:", error);
      if (error.logs) {
        console.log("Error logs:", error.logs);
      }
      throw error;
    }
  });
  it("Should swap for Bob (non-admin) - Sol to Meme with admin fees", async () => {
    console.log(
      `\n Swapping for Bob (non-admin) - Sol to Meme with admin fees\n`
    );
    const sender = user;
    const admin = (sender as any).payer;
    const connection = provider.connection;

    const token0Mint = NATIVE_MINT;
    const token1Mint = memeMint;

    // First wrap some SOL and check token balances
    await wrapSol(connection, bob, 10); // Wrap 10 SOL

    const inputFeeBps = 100; // 1%
    const outputFeeBps = 100; // 1%

    console.log("Test1.1");

    const poolAddress = await poolInfo(token0Mint, token1Mint, false);
    const {
      userToken0Account: adminToken0Account,
      userToken1Account: adminToken1Account,
    } = await userInfo(connection, admin, token0Mint, token1Mint, "Admin");

    console.log("Test1.2");

    const {
      userToken0Account: bobToken0Account,
      userToken1Account: bobToken1Account,
    } = await userInfo(connection, bob, token0Mint, token1Mint, "Bob");

    console.log("Test1.3");
    const { token0Vault, token1Vault, observationState } = await poolSeedInfo(
      admin,
      token0Mint,
      token1Mint
    );

    // Amount to swap (1 SOL)
    const amount_in = new BN(1 * LAMPORTS_PER_SOL);
    // Pool Balance for Sol
    let amount0 = await getAccount(connection, token0Vault);
    /// Pool Balance for Meme
    let amount1 = await getAccount(connection, token1Vault);

    console.log("Starting swap...");
    console.log("Input amount:", Number(amount_in) / LAMPORTS_PER_SOL, "SOL");
    console.log("WSOL balance:", Number(amount0.amount) / LAMPORTS_PER_SOL);
    console.log(
      "MEME balance:",
      formatBalanceInMillions(Number(amount1.amount) / LAMPORTS_PER_SOL)
    );

    // Build the swap instruction
    const swapIx = await program.methods
      .proxySwapBaseInput(
        amount_in,
        new BN(0),
        new BN(inputFeeBps),
        new BN(outputFeeBps)
      ) // amount_in and minimum_amount_out
      .accounts({
        // Pool accounts
        ammConfig: ammConfig,
        poolState: poolAddress,
        inputTokenAccount: bobToken0Account.address,
        outputTokenAccount: bobToken1Account.address,
        inputVault: token0Vault,
        outputVault: token1Vault,
        inputTokenProgram: TOKEN_PROGRAM_ID,
        outputTokenProgram: TOKEN_PROGRAM_ID,
        inputTokenMint: token0Mint,
        outputTokenMint: token1Mint,
        observationState: observationState,
        // Target config and admin fee accounts
        adminInputTokenAccount: adminToken0Account.address,
        adminOutputTokenAccount: adminToken1Account.address,
      })
      .accountsPartial({
        payer: bob.publicKey,
      })
      .signers([bob])
      .instruction();

    // Add compute budget instruction for more CUs
    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000,
    });

    // Create and send transaction
    const transaction = new Transaction().add(computeBudgetIx).add(swapIx);

    console.log("Sending swap transaction...");

    try {
      const swapTx = await sendAndConfirmTransaction(
        connection,
        transaction,
        [bob, admin],
        confirmOptions
      );

      console.log("✅ Swap successful! Transaction signature:", swapTx);

      let newAmount0 = await getAccount(connection, token0Vault);

      amount1 = await getAccount(connection, token1Vault);

      console.log("\n Ending swap for the Pool with:");
      console.log("WSOL Balance:", Number(amount0.amount) / LAMPORTS_PER_SOL);
      console.log(
        "MEME Balance:",
        formatBalanceInMillions(Number(amount1.amount) / LAMPORTS_PER_SOL)
      );

      let diff = Number(newAmount0.amount) - Number(amount0.amount);

      console.log(
        "Difference in WSOL Balance:",
        diff / LAMPORTS_PER_SOL,
        "WSOL"
      );

      await userInfo(connection, alice, token0Mint, token1Mint, "Alice");
      await userInfo(connection, payer, token0Mint, token1Mint, "Admin");
    } catch (error) {
      console.error("❌ Swap failed:", error);
      if (error.logs) {
        console.log("Error logs:", error.logs);
      }
      throw error;
    }
  });
});
