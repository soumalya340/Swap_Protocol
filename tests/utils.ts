import * as anchor from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  AccountLayout,
  NATIVE_MINT,
  createSyncNativeInstruction,
  getAccount,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";

let memeMint: any;

async function createMemeMint() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const user = provider.wallet;

  const sender = user;
  const payer = (sender as any).payer;
  const connection = provider.connection;

  const memeMintKeypair = Keypair.generate();
  // Step 4: CREATE the mint account on-chain!
  memeMint = await createMint(
    provider.connection,
    payer, // Payer
    payer.publicKey, // Temporary mint authority
    null, // No freeze authority
    9, // Decimals
    memeMintKeypair, // Use our keypair
    undefined,
    TOKEN_PROGRAM_ID
  );

  console.log("memeMint address", memeMint.toBase58());

  // Store the mint address in PublicKey.json
  const mintData = {
    PublicKey: memeMint.toBase58(),
  };

  fs.writeFileSync("PublicKey.json", JSON.stringify(mintData, null, 2));
  console.log("Mint address saved to PublicKey.json");

  let mintInfo = await getMint(connection, memeMint);

  console.log("token supply :", mintInfo.supply);

  let mintTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    memeMint,
    user.publicKey
  );

  const tokenAmount = 100_000_000 * LAMPORTS_PER_SOL;

  await mintTo(
    provider.connection,
    payer,
    memeMint,
    mintTokenAccount.address,
    payer.publicKey,
    tokenAmount
  );

  mintInfo = await getMint(connection, memeMint);

  console.log(mintInfo.supply);
  // 100

  const tokenAccountInfo = await getAccount(
    connection,
    mintTokenAccount.address
  );

  console.log(tokenAccountInfo.amount);

  return memeMint;
}

async function getAllTokens() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const user = provider.wallet;

  const sender = user;
  const payer = (sender as any).payer;
  const connection = provider.connection;

  const tokenAccounts = await connection.getTokenAccountsByOwner(
    user.publicKey,
    {
      programId: TOKEN_PROGRAM_ID,
    }
  );

  console.log("Token                                         Balance");
  console.log("------------------------------------------------------------");
  tokenAccounts.value.forEach((tokenAccount) => {
    const accountData = AccountLayout.decode(tokenAccount.account.data);
    console.log(`${new PublicKey(accountData.mint)}   ${accountData.amount}`);
  });
}

async function wrapSol(
  connection: Connection,
  wallet: Keypair,
  amountInSol: number = 0
): Promise<PublicKey> {
  const associatedTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet,
    NATIVE_MINT,
    wallet.publicKey
  );
  if (
    amountInSol > 0 &&
    Number(associatedTokenAccount.amount) < 60 * LAMPORTS_PER_SOL
  ) {
    // Single transaction: transfer + sync
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: associatedTokenAccount.address,
        lamports: amountInSol * LAMPORTS_PER_SOL,
      }),
      createSyncNativeInstruction(associatedTokenAccount.address)
    );

    await sendAndConfirmTransaction(connection, tx, [wallet]);
  }

  return associatedTokenAccount.address;
}

// Helper function to get target config PDA
export function getTargetConfigPda(program: any): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );
}

async function getPoolAddress(
  ammConfig: PublicKey,
  token0Mint: PublicKey,
  token1Mint: PublicKey,
  programId: PublicKey
): Promise<[PublicKey, number]> {
  const POOL_SEED = Buffer.from("pool");
  return PublicKey.findProgramAddress(
    [
      POOL_SEED,
      ammConfig.toBuffer(),
      token0Mint.toBuffer(),
      token1Mint.toBuffer(),
    ],
    programId
  );
}

export {
  createMemeMint,
  getAllTokens,
  wrapSol,
  NATIVE_MINT,
  LAMPORTS_PER_SOL,
  getPoolAddress,
};
