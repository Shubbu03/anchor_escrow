use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, TokenAccount, Token, TransferChecked},
};

use crate::Escrow;

#[derive(Accounts)]
#[instruction(seed:u64)]
pub struct Make<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,
    #[account(mut)]
    pub mint_a: Account<'info, Mint>,
    #[account(mut)]
    pub mint_b: Account<'info, Mint>,
    #[account(mut, associated_token::mint = mint_a, associated_token::authority = maker)]
    pub maker_ata_a: Account<'info, TokenAccount>,
    #[account(init, payer = maker, space = 8 + Escrow::INIT_SPACE, seeds = [b"escrow", maker.key().as_ref(), &seed.to_le_bytes()], bump)]
    pub escrow: Account<'info, Escrow>,
    #[account(init, payer = maker, associated_token::mint = mint_a, associated_token::authority = escrow)]
    pub vault: Account<'info, TokenAccount>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> Make<'info> {
    pub fn save_escrow(&mut self, seed: u64, recieve: u64, bump: &MakeBumps) -> Result<()> {
        self.escrow.set_inner(Escrow {
            seed,
            maker: self.maker.key(),   // first user pubkey
            mint_a: self.mint_a.key(), // first token mint add
            mint_b: self.mint_b.key(), // second token mint add
            recieve,                   //desired recieving amount
            bump: bump.escrow,
        });
        Ok(())
    }

    pub fn deposit(&mut self, deposit: u64) -> Result<()> {
        let transfer_accounts = TransferChecked {
            from: self.maker_ata_a.to_account_info(),
            mint: self.mint_a.to_account_info(),
            to: self.vault.to_account_info(), // vault
            authority: self.maker.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(self.token_program.to_account_info(), transfer_accounts);

        transfer_checked(cpi_ctx, deposit, self.mint_a.decimals)
    }
}
