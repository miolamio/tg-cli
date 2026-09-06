import { Command } from 'commander';
import { outputError } from '../../lib/output.js';
import { ErrorCode } from '../../lib/error-codes.js';

/**
 * Generate shell completion scripts for bash, zsh, or fish.
 * Install via: eval "$(tg completion bash)"
 */
export function createCompletionCommand(): Command {
  const completion = new Command('completion')
    .argument('<shell>', 'Shell type: bash, zsh, or fish')
    .description('Generate shell completion script')
    .action((shell: string) => {
      const scripts: Record<string, string> = {
        bash: generateBashCompletion(),
        zsh: generateZshCompletion(),
        fish: generateFishCompletion(),
      };

      const script = scripts[shell];
      if (!script) {
        outputError(`Unknown shell: ${shell}. Use: bash, zsh, or fish`, ErrorCode.INVALID_INPUT);
        return;
      }

      process.stdout.write(script);
    });

  return completion;
}

function generateBashCompletion(): string {
  return `# tg bash completion
_tg_completions() {
  local cur prev commands
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  commands="auth session chat message media user contact daemon completion"

  case "\${COMP_WORDS[1]}" in
    auth)    COMPREPLY=( $(compgen -W "login status logout" -- "$cur") ) ;;
    session) COMPREPLY=( $(compgen -W "export import" -- "$cur") ) ;;
    chat)    COMPREPLY=( $(compgen -W "list info join leave resolve invite-info members topics search create edit kick" -- "$cur") ) ;;
    message) COMPREPLY=( $(compgen -W "history search get pinned send forward react replies edit delete pin unpin poll watch" -- "$cur") ) ;;
    media)   COMPREPLY=( $(compgen -W "download send" -- "$cur") ) ;;
    user)    COMPREPLY=( $(compgen -W "profile block unblock blocked" -- "$cur") ) ;;
    contact) COMPREPLY=( $(compgen -W "list add delete search" -- "$cur") ) ;;
    daemon)  COMPREPLY=( $(compgen -W "start stop status" -- "$cur") ) ;;
    *)       COMPREPLY=( $(compgen -W "$commands" -- "$cur") ) ;;
  esac
}
complete -F _tg_completions tg
`;
}

function generateZshCompletion(): string {
  return `#compdef tg
_tg() {
  local -a commands
  local state
  _arguments -C \\
    '1: :->command' \\
    '*:: :->args'

  case $state in
    command)
      commands=(
        'auth:Authentication management'
        'session:Session import/export'
        'chat:Chat discovery and management'
        'message:Message reading and sending'
        'media:Media upload/download'
        'user:User profiles and blocking'
        'contact:Contact management'
        'daemon:Persistent connection daemon'
        'completion:Generate shell completions'
      )
      _describe 'command' commands
      ;;
    args)
      case $words[1] in
        auth)      _describe 'subcommand' '(login:Log in status:Auth status logout:Log out)' ;;
        session)   _describe 'subcommand' '(export:Export session import:Import session)' ;;
        chat)      _describe 'subcommand' '(list:List chats info:Chat info join:Join leave:Leave resolve:Resolve invite-info:Invite info members:Members topics:Topics search:Search create:Create edit:Edit kick:Kick)' ;;
        message)   _describe 'subcommand' '(history:History search:Search get:Get pinned:Pinned send:Send forward:Forward react:React replies:Replies edit:Edit delete:Delete pin:Pin unpin:Unpin poll:Poll watch:Watch)' ;;
        media)     _describe 'subcommand' '(download:Download send:Send)' ;;
        user)      _describe 'subcommand' '(profile:Profile block:Block unblock:Unblock blocked:Blocked)' ;;
        contact)   _describe 'subcommand' '(list:List add:Add delete:Delete search:Search)' ;;
        daemon)    _describe 'subcommand' '(start:Start stop:Stop status:Status)' ;;
      esac
      ;;
  esac
}
_tg "$@"
`;
}

function generateFishCompletion(): string {
  return `# tg fish completion
complete -c tg -n '__fish_use_subcommand' -a auth -d 'Authentication management'
complete -c tg -n '__fish_use_subcommand' -a session -d 'Session import/export'
complete -c tg -n '__fish_use_subcommand' -a chat -d 'Chat discovery and management'
complete -c tg -n '__fish_use_subcommand' -a message -d 'Message reading and sending'
complete -c tg -n '__fish_use_subcommand' -a media -d 'Media upload/download'
complete -c tg -n '__fish_use_subcommand' -a user -d 'User profiles and blocking'
complete -c tg -n '__fish_use_subcommand' -a contact -d 'Contact management'
complete -c tg -n '__fish_use_subcommand' -a daemon -d 'Persistent connection daemon'
complete -c tg -n '__fish_use_subcommand' -a completion -d 'Generate shell completions'

complete -c tg -n '__fish_seen_subcommand_from auth' -a 'login status logout'
complete -c tg -n '__fish_seen_subcommand_from session' -a 'export import'
complete -c tg -n '__fish_seen_subcommand_from chat' -a 'list info join leave resolve invite-info members topics search create edit kick'
complete -c tg -n '__fish_seen_subcommand_from message' -a 'history search get pinned send forward react replies edit delete pin unpin poll watch'
complete -c tg -n '__fish_seen_subcommand_from media' -a 'download send'
complete -c tg -n '__fish_seen_subcommand_from user' -a 'profile block unblock blocked'
complete -c tg -n '__fish_seen_subcommand_from contact' -a 'list add delete search'
complete -c tg -n '__fish_seen_subcommand_from daemon' -a 'start stop status'
complete -c tg -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'
`;
}
