import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import { BN } from "bn.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, Account, TOKEN_PROGRAM_ID, createMint, getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL} from '@solana/web3.js';
import { randomBytes } from "crypto";
import { confirmTransaction } from "@solana-developers/helpers";
import { expect } from "chai";


const programId = new PublicKey("GgiwFFjRLmrZvATt4Az1MKnegFu1nVxHEVgfWAwXZwaC");

describe("Make Instruction:", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();

  const connection = provider.connection;

  const program = anchor.workspace.Escrow as Program<Escrow>;

  const maker = anchor.web3.Keypair.generate();
  const taker = anchor.web3.Keypair.generate();

  const seed = new BN(randomBytes(8));
  const receive_amount = 1;
  const deposit_amount = 1;


  let [escrow] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      maker.publicKey.toBuffer(),
      seed.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );

  let vault: anchor.web3.PublicKey;
  let mintA: anchor.web3.PublicKey;
  let mintB: anchor.web3.PublicKey;
  let makerAtaA: Account;
  let takerAtaA: Account;

  before(
    "Create Accounts",
    async () => {
      let airdrop1 = await provider.connection.requestAirdrop(maker.publicKey, 2 * LAMPORTS_PER_SOL);
      let airdrop1_tx = await confirmTransaction(connection, airdrop1, "confirmed");
      console.log("Airdrop 1:", airdrop1_tx);

      let airdrop2 = await provider.connection.requestAirdrop(taker.publicKey, 2 * LAMPORTS_PER_SOL);
      let airdrop2_tx = await confirmTransaction(connection, airdrop2, "confirmed");
      console.log("Airdrop 1:", airdrop2_tx);

      // Create Token Mint that would be used to Create Escrow
      mintA = await createMint(
        connection,
        maker,
        maker.publicKey,
        null,
        6,
      );
      console.log("MintA Address:", mintA);

      mintB = await createMint(
        connection,
        taker,
        taker.publicKey,
        null,
        6,
      );
      console.log("MintB Address:", mintB);

      makerAtaA = await getOrCreateAssociatedTokenAccount(
        connection,
        maker,
        mintA,
        maker.publicKey,
      );
      console.log("Maker ATA A: ", makerAtaA.address);

      takerAtaA = await getOrCreateAssociatedTokenAccount(
        connection,
        taker,
        mintB,
        taker.publicKey,
      );
      console.log("Taker ATA B: ", takerAtaA.address);

      // Mint token A and B to the respective accounts
      let mint1_tx = await mintTo(connection, maker, mintA, makerAtaA.address, maker, 10000 * 10 ** 6);
      console.log("Mint 1 Tx: ", mint1_tx);

      let mint2_tx = await mintTo(connection, taker, mintB, takerAtaA.address, taker, 20000 * 10 ** 6);
      console.log("Mint 2 Tx: ", mint2_tx);

      vault = await getAssociatedTokenAddress(
        mintA,
        escrow,
        true,
        TOKEN_PROGRAM_ID,
      )
      console.log("Vault Address:", vault);
    }
  )

  it("Make an Escrow!", async () => {
    await program.methods.make(seed, new BN(deposit_amount), new BN(receive_amount)).accountsPartial({
      maker: maker.publicKey,
      mintA,
      mintB,
      makerAtaA: makerAtaA.address,
      vault,
      escrow,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).signers([maker]).rpc();

  });

  it("Refund the Escrow!", async () => {
    await program.methods
      .refund()
      .accountsPartial({
        maker: maker.publicKey,
        mintA,
        makerAtaA: makerAtaA.address,
        escrow,
        vault,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([maker])
      .rpc();

    const escrowAccount = await program.account.escrow.fetchNullable(escrow);
    expect(escrowAccount).to.be.null;
  });

  describe("Take Instruction:", () => {
    const maker2 = anchor.web3.Keypair.generate();
    const taker2 = anchor.web3.Keypair.generate();

    const seed2 = new BN(randomBytes(8));
    const deposit_amount2 = 1;
    const receive_amount2 = 1;

    let escrow2: PublicKey;
    let vault2: PublicKey;
    let mintA2: PublicKey;
    let mintB2: PublicKey;
    let makerAtaA2: any;
    let takerAtaB2: any;
    let takerAtaA2: any;
    let makerAtaB2: PublicKey;

    before("Create accounts for take flow", async () => {
      // Airdrops (confirm so funds are usable in the same slot)
      const drop1Sig = await provider.connection.requestAirdrop(maker2.publicKey, 2 * LAMPORTS_PER_SOL);
      await confirmTransaction(connection, drop1Sig, "confirmed");

      const drop2Sig = await provider.connection.requestAirdrop(taker2.publicKey, 2 * LAMPORTS_PER_SOL);
      await confirmTransaction(connection, drop2Sig, "confirmed");

      // Mints
      mintA2 = await createMint(connection, maker2, maker2.publicKey, null, 6);
      mintB2 = await createMint(connection, taker2, taker2.publicKey, null, 6);

      // Token accounts
      makerAtaA2 = await getOrCreateAssociatedTokenAccount(connection, maker2, mintA2, maker2.publicKey);
      takerAtaB2 = await getOrCreateAssociatedTokenAccount(connection, taker2, mintB2, taker2.publicKey);

      // Mint some tokens
      await mintTo(connection, maker2, mintA2, makerAtaA2.address, maker2, 10000 * 10 ** 6);
      await mintTo(connection, taker2, mintB2, takerAtaB2.address, taker2, 20000 * 10 ** 6);

      // Derive PDA & vault
      [escrow2] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("escrow"),
          maker2.publicKey.toBuffer(),
          seed2.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      vault2 = await getAssociatedTokenAddress(mintA2, escrow2, true, TOKEN_PROGRAM_ID);

      // Create Escrow
      await program.methods
        .make(seed2, new BN(deposit_amount2), new BN(receive_amount2))
        .accountsPartial({
          maker: maker2.publicKey,
          mintA: mintA2,
          mintB: mintB2,
          makerAtaA: makerAtaA2.address,
          vault: vault2,
          escrow: escrow2,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([maker2])
        .rpc();

      // Accounts that may be created on demand during take
      takerAtaA2 = await getOrCreateAssociatedTokenAccount(connection, taker2, mintA2, taker2.publicKey);
      makerAtaB2 = await getAssociatedTokenAddress(mintB2, maker2.publicKey, true, TOKEN_PROGRAM_ID);
    });

    it("Take the Escrow!", async () => {
      await program.methods
        .take()
        .accountsPartial({
          taker: taker2.publicKey,
          maker: maker2.publicKey,
          mintA: mintA2,
          mintB: mintB2,
          takerAtaA: takerAtaA2.address,
          takerAtaB: takerAtaB2.address,
          makerAtaB: makerAtaB2,
          escrow: escrow2,
          vault: vault2,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([taker2])
        .rpc();

      const escrowAccount = await program.account.escrow.fetchNullable(escrow2);
      expect(escrowAccount).to.be.null;
    });
  });
});