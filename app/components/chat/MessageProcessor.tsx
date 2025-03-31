import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { useChatHistory } from '~/lib/persistence/useChatHistory';
import { workbenchStore } from '~/lib/stores/workbench';
import { StreamingMessageParser } from '~/lib/runtime/message-parser';
import { ActionRunner } from '~/lib/runtime/action-runner';
import { webcontainer } from '~/lib/webcontainer';
import { generateId } from '~/utils/fileUtils';
import type { Message } from 'ai';
import { toast } from 'react-toastify';

/**
 * A component that processes pending messages using the useChatHistory hook
 * This component must be rendered within a React component tree where hooks can be used
 */
export const MessageProcessor = () => {
  const { storeMessageHistory } = useChatHistory();
  const pendingMessages = useStore(workbenchStore.pendingMessages);
  const showTerminal = useStore(workbenchStore.showTerminal);

  useEffect(() => {
    const processPendingMessages = async () => {
      if (pendingMessages && pendingMessages.length > 0) {
        console.log('Traitement des messages en attente :', pendingMessages);

        // Check if this is an npm command button click
        let setupCommand = '';
        let startCommand = '';
        let isSkip = false;

        // Try to identify if this is a project setup command set or a skip
        const actionDetected = pendingMessages.some((msg) => {
          if (msg.role === 'user' && msg.content) {
            if (msg.content.includes("No, I'll skip for now")) {
              isSkip = true;
              return true;
            }
          }

          if (
            msg.role === 'assistant' &&
            msg.content &&
            msg.content.includes('Running Project Setup') &&
            msg.content.includes('<boltArtifact id="project-run-')
          ) {
            // It's a setup message, now try to extract commands
            if (msg.content.includes('<boltAction type="shell">npm install</boltAction>')) {
              setupCommand = 'npm install';
            }

            if (msg.content.includes('<boltAction type="start">npm run dev</boltAction>')) {
              startCommand = 'npm run dev';
            }

            return setupCommand || startCommand;
          }

          return false;
        });

        // Store the messages using the hook
        await storeMessageHistory(pendingMessages);

        // If the user chose to skip
        if (isSkip) {
          // Add a confirmation message that setup was skipped
          const skipConfirmationMsg: Message = {
            role: 'assistant',
            id: generateId(),
            content:
              'La configuration a été ignorée. Vous pouvez configurer et exécuter le projet manuellement plus tard en utilisant le terminal si nécessaire.',
            createdAt: new Date(),
          };

          await storeMessageHistory([skipConfirmationMsg]);
          toast.info('Configuration ignorée');

          // Clear pending messages and return
          workbenchStore.pendingMessages.set([]);

          return;
        }

        // If we detected setup commands, handle them directly
        if (actionDetected && (setupCommand || startCommand)) {
          console.log(`Commandes de configuration détectées : ${setupCommand || 'aucune'}, ${startCommand || 'aucune'}`);

          // Make sure the workbench is visible
          workbenchStore.showWorkbench.set(true);

          // Show the terminal
          workbenchStore.toggleTerminal(true);

          // Ensure the terminal is ready
          try {
            const terminal = workbenchStore.boltTerminal;
            await terminal.ready();
            console.log('Le terminal est prêt à recevoir des commandes');

            // Run the setup command first if present
            if (setupCommand) {
              console.log(`Exécution de la commande de configuration : ${setupCommand}`);
              toast.info(`Exécution : ${setupCommand}`);

              await terminal.executeCommand(`setup-${Date.now()}`, setupCommand, () =>
                console.log('Setup command aborted'),
              );

              // Wait a bit before running the start command
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            // Then run the start command if present
            if (startCommand) {
              console.log(`Exécution de la commande de démarrage : ${startCommand}`);
              toast.info(`Démarrage du serveur de développement : ${startCommand}`);

              await terminal.executeCommand(`start-${Date.now()}`, startCommand, () =>
                console.log('Start command aborted'),
              );
            }

            // Add a success confirmation message
            const confirmationMsg: Message = {
              role: 'assistant',
              id: generateId(),
              content: `✅ Configuration du projet terminée !\n\n${setupCommand ? `• Installation des packages terminée (${setupCommand})\n` : ''}${startCommand ? `• Serveur de développement démarré (${startCommand})\n` : ''}\n\nVous pouvez maintenant continuer votre développement. L'application devrait être disponible dans le panneau de prévisualisation.`,
              createdAt: new Date(),
            };

            await storeMessageHistory([confirmationMsg]);
            toast.success('Configuration terminée');
          } catch (error) {
            console.error('Erreur lors de l\'exécution des commandes :', error);

            // Add an error message
            const errorMsg: Message = {
              role: 'assistant',
              id: generateId(),
              content: `❌ Une erreur s'est produite lors de la configuration du projet:\n\n${error}\n\nVeuillez essayer d'exécuter les commandes manuellement dans le terminal.`,
              createdAt: new Date(),
            };

            await storeMessageHistory([errorMsg]);
            toast.error('Échec de la configuration');
          }
        } else {
          /*
           * Process messages using the normal action system
           * Make sure the workbench is visible
           */
          workbenchStore.showWorkbench.set(true);

          // Show the terminal
          workbenchStore.toggleTerminal(true);

          // Ensure the terminal is initialized and ready
          try {
            const terminal = workbenchStore.boltTerminal;

            // Wait for terminal to be ready
            await terminal.ready();
            console.log('Le terminal est prêt à recevoir des commandes');
          } catch (error) {
            console.error('Terminal initialization error:', error);
          }

          // Process each message for potential commands
          for (const message of pendingMessages) {
            if (message.role === 'assistant' && message.content) {
              // Check if this message contains artifact tags
              if (message.content.includes('<boltArtifact') && message.content.includes('<boltAction')) {
                console.log('Action bolt détectée dans le message - traitement en cours...');

                const parser = new StreamingMessageParser({
                  callbacks: {
                    onArtifactOpen: (data) => {
                      console.log('Artifact opened:', data);

                      // Create an artifact runner if needed
                      const runner = new ActionRunner(
                        webcontainer,
                        () => workbenchStore.boltTerminal,
                        (alert) => workbenchStore.actionAlert.set(alert),
                        (alert) => workbenchStore.supabaseAlert.set(alert),
                      );

                      // Create the artifact object with actions pre-initialized
                      const artifact = {
                        id: data.id,
                        messageId: message.id,
                        title: data.title || 'Command Execution',
                        type: data.type || 'project-run',
                        runner,
                      };

                      // Register the artifact with the workbench
                      workbenchStore.registerArtifact(message.id, artifact);
                    },
                    onActionOpen: (data) => {
                      console.log('Action opened:', data);

                      const artifact = workbenchStore.getArtifact(message.id);

                      if (artifact && artifact.runner) {
                        // Add the action using the proper method signature
                        artifact.runner.addAction({
                          actionId: data.actionId,
                          messageId: data.messageId,
                          artifactId: data.artifactId,
                          action: data.action,
                        });
                      }
                    },
                    onActionClose: (data) => {
                      console.log('Action closed:', data);

                      // We will execute actions after all parsing is done
                    },
                  },
                });

                // Parse to register artifacts and actions
                parser.parse(message.id, message.content);

                // Wait a moment for everything to be registered
                await new Promise((resolve) => setTimeout(resolve, 500));

                // Access the artifact to execute actions
                const artifact = workbenchStore.getArtifact(message.id);

                if (artifact && artifact.runner) {
                  // Get all registered actions
                  const actions = artifact.runner.actions.get();
                  console.log('Actions enregistrées :', Object.keys(actions));

                  // Execute each shell or start action in sequence
                  const actionIds = Object.keys(actions).sort((a, b) => parseInt(a) - parseInt(b));

                  let successCount = 0;
                  const totalActions = actionIds.length;

                  for (const actionId of actionIds) {
                    const action = actions[actionId];

                    if (action.type === 'shell' || action.type === 'start') {
                      console.log(`Exécution de l\'action ${actionId} :`, action);

                      // Ensure the action has content
                      if (!action.content || action.content.trim() === '') {
                        console.error(`L\'action ${actionId} a un contenu vide`);
                        continue;
                      }

                      try {
                        // Make sure we explicitly invoke the shell command with the correct content
                        if (action.type === 'shell') {
                          await workbenchStore.boltTerminal.executeCommand(`cmd-${Date.now()}`, action.content, () =>
                            console.log('Command aborted'),
                          );
                        } else {
                          await artifact.runner.runAction({
                            messageId: message.id,
                            artifactId: artifact.id,
                            actionId,
                            action,
                          });
                        }

                        successCount++;

                        // Add a short delay between commands
                        await new Promise((resolve) => setTimeout(resolve, 800));
                      } catch (error) {
                        console.error(`Erreur lors de l\'exécution de l\'action ${action.type} :`, error);
                      }
                    }
                  }

                  // Add a confirmation message
                  if (successCount > 0) {
                    const confirmationMsg: Message = {
                      role: 'assistant',
                      id: generateId(),
                      content: `✅ Commands executed: ${successCount}/${totalActions} actions completed successfully.`,
                      createdAt: new Date(),
                    };

                    await storeMessageHistory([confirmationMsg]);
                    toast.success('Commandes exécutées');
                  }
                }
              }
            }
          }
        }

        // Clear the pending messages
        workbenchStore.pendingMessages.set([]);
      }
    };

    processPendingMessages();
  }, [pendingMessages, storeMessageHistory, showTerminal]);

  // This component doesn't render anything
  return null;
};
