import { createContext, useContext } from 'react';

export type AccountReason = 'publish' | 'comment' | 'revive' | 'suggest' | 'vote';

interface Gate {
  /** True when the visitor may continue. Signed-out visitors get the account panel instead. */
  requireAccount: (reason: AccountReason) => boolean;
}

const Ctx = createContext<Gate>({ requireAccount: () => true });

export const AccountGateProvider = Ctx.Provider;

export const useAccountGate = () => useContext(Ctx);

export const GATE_COPY: Record<AccountReason, { title: string; body: string }> = {
  publish: {
    title: '> ARCHIVING NEEDS AN IDENTITY.',
    body: 'Abandoned projects are claimed by a real builder. Create a free account, or sign in, and the publish form opens right where you left it.',
  },
  comment: {
    title: '> COMMS ARE FOR MEMBERS.',
    body: 'Comments are tied to an account so founders know who is talking to them. It takes a few seconds and costs nothing.',
  },
  revive: {
    title: '> REVIVAL SIGNALS ARE SIGNED.',
    body: 'A revival proposal carries your contact details straight to the project founder, so it needs an account behind it.',
  },
  suggest: {
    title: '> THE ROADMAP IS BUILT WITH MEMBERS.',
    body: 'Suggestions are public and permanent, so they carry an account name. Your draft stays exactly where it is — sign in and post it.',
  },
  vote: {
    title: '> VOTES NEED AN ACCOUNT.',
    body: 'One vote per account per project or suggestion only works if the database knows the account. Sign in and tap the vote again.',
  },
};
