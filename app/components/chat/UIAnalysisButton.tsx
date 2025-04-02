import React, { useState } from 'react';
import { toast } from 'react-toastify';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { ProviderInfo } from '~/types/model';

interface UIAnalysisButtonProps {
  imageData: string;
  model: string;
  provider: ProviderInfo;
  disabled?: boolean;
  onAnalysisComplete: (prompt: string) => void;
}

const uiAnalysisButton: React.FC<UIAnalysisButtonProps> = ({
  imageData,
  model,
  provider,
  disabled = false,
  onAnalysisComplete,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeUI = async () => {
    if (!imageData || disabled || isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);

    const toastId = toast.info(
      <div>
        <div className="font-bold">Analisando interface UI/UX...</div>
        <div className="text-xs text-gray-200 bg-gray-800 p-2 mt-1 rounded">Isso pode levar alguns instantes.</div>
      </div>,
      { autoClose: false },
    );

    try {
      // Limpa o input atual e notifica o início do processo
      onAnalysisComplete('');

      // Pequeno delay para garantir que a UI atualize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Texto inicial para informar ao usuário
      onAnalysisComplete(
        'Gerando análise da interface UI/UX...\n\nEste processo pode levar até 1 minuto, dependendo da complexidade da imagem.',
      );

      // Preparar os dados para envio
      const formData = new FormData();
      formData.append('imageData', imageData);
      formData.append('model', model);
      formData.append('provider', JSON.stringify(provider));

      console.log(`Enviando requisição para análise de UI com modelo: ${model}`);

      // Abordagem 1: Usando EventSource para processar SSE de forma nativa
      try {
        // Primeiro tentamos usar a abordagem nativa de SSE (mais confiável para streaming)
        await processWithEventSource(formData, onAnalysisComplete, toastId.toString());
      } catch (eventSourceError) {
        console.warn('Falha no processamento com EventSource, tentando método alternativo:', eventSourceError);
        // Se falhar, tentamos a abordagem com fetch
        await processWithFetch(formData, onAnalysisComplete, toastId.toString());
      }
    } catch (error) {
      console.error('Erro na análise de UI:', error);
      // Insere uma mensagem de erro no input
      onAnalysisComplete('Erro na análise de interface. Por favor, tente novamente.');

      toast.update(toastId, {
        render: (
          <div>
            <div className="font-bold">Erro na análise</div>
            <div className="text-xs text-gray-200 bg-gray-800 p-2 mt-1 rounded">
              {error instanceof Error ? error.message : 'Ocorreu um erro desconhecido'}
            </div>
          </div>
        ),
        type: 'error',
        autoClose: 5000,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Define interface para a resposta da API
  interface AnalysisResponse {
    status: string;
    id: string;
  }

  // Função para processar usando o EventSource (melhor para SSE)
  const processWithEventSource = (formData: FormData, onAnalysisComplete: (text: string) => void, toastId: string) => {
    return new Promise((resolve, reject) => {
      // Criamos um endpoint de proxy temporário devido às limitações do EventSource
      const uniqueId = Date.now().toString();
      const url = `/api/ui-analysis?id=${uniqueId}`;

      console.log('Iniciando análise de UI com ID:', uniqueId);

      // Enviamos os dados primeiro com o ID no URL para associar ao cache
      fetch(`/api/ui-analysis?id=${uniqueId}`, {
        method: 'POST',
        body: formData,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Erro na resposta do servidor: ${response.status} ${response.statusText}`);
          }

          // Aguardamos a resposta JSON para confirmar que o processamento foi iniciado
          return response.json() as Promise<AnalysisResponse>;
        })
        .then((_data) => {
          if (!_data || !_data.status || _data.status !== 'processing') {
            throw new Error('Resposta inválida do servidor durante inicialização da análise');
          }

          console.log('Processamento iniciado no servidor, ID:', _data.id);

          /*
           * Aumentamos o delay para garantir que o cache esteja pronto no servidor
           * O servidor agora processa o stream em background, então precisamos esperar mais
           */
          return new Promise<AnalysisResponse>((resolve) => setTimeout(() => resolve(_data), 1500));
        })
        .then((_data) => {
          /*
           * Se o fetch for bem sucedido e o servidor respondeu com status "processing",
           * agora podemos criar o EventSource
           */
          console.log('Iniciando EventSource para receber os dados...');

          // Criamos o EventSource com retry automático
          const eventSource = new EventSource(url);
          let result = '';
          let retryCount = 0;
          const maxRetries = 3;

          // Definimos um timeout para garantir que não ficamos esperando indefinidamente
          const timeoutId = setTimeout(() => {
            console.warn('Timeout ao aguardar dados do EventSource');
            eventSource.close();

            // Se já temos algum resultado, usamos ele mesmo incompleto
            if (result && result.trim() !== '') {
              console.log('Usando resultado parcial obtido até o momento');
              onAnalysisComplete(result);
              resolve('partial-success');
            } else {
              // Caso contrário, tentamos o método alternativo
              reject(new Error('Timeout ao aguardar dados do EventSource'));
            }
          }, 30000); // 30 segundos de timeout

          eventSource.onmessage = (event) => {
            // Limpa o timeout a cada mensagem recebida
            clearTimeout(timeoutId);

            console.log('Evento SSE recebido:', event.data.substring(0, 50) + '...');

            if (event.data === '[DONE]') {
              console.log('Stream concluído com sucesso');
              eventSource.close();
              clearTimeout(timeoutId);

              // Verificar se obtivemos algum texto
              if (!result || result.trim() === '') {
                eventSource.close();
                reject(new Error('Nenhum texto foi gerado pela análise'));

                return;
              }

              // Verifica se o resultado contém as tags esperadas antes de atualizar
              const containsStructure =
                result.includes('<summary_title>') &&
                result.includes('<image_analysis>') &&
                result.includes('<development_planning>') &&
                result.includes('<implementation_requirements>');

              // Atualiza o texto no input incrementalmente
              if (containsStructure) {
                onAnalysisComplete(result);
              } else if (result.trim() !== '') {
                /*
                 * Se ainda não temos a estrutura completa, continuamos mostrando a mensagem de processamento
                 * mas adicionamos o texto que está chegando para dar feedback visual
                 */
                onAnalysisComplete('Gerando análise da interface UI/UX...\n\n' + result);
              }

              toast.update(toastId, {
                render: (
                  <div>
                    <div className="font-bold">Análise concluída!</div>
                    <div className="text-xs text-gray-200 bg-gray-800 p-2 mt-1 rounded">
                      Prompt estruturado gerado com sucesso.
                    </div>
                  </div>
                ),
                type: 'success',
                autoClose: 2000,
              });

              resolve('success');

              return;
            }

            try {
              // Acumula o resultado
              result += event.data;

              // Verifica se o resultado contém as tags esperadas antes de atualizar
              const containsStructure =
                result.includes('<summary_title>') &&
                result.includes('<image_analysis>') &&
                result.includes('<development_planning>') &&
                result.includes('<implementation_requirements>');

              // Atualiza o texto no input incrementalmente
              if (containsStructure) {
                onAnalysisComplete(result);
              } else if (result.trim() !== '') {
                // Se ainda não temos a estrutura completa, continuamos mostrando a mensagem de processamento
                onAnalysisComplete('Gerando análise da interface UI/UX...\n\n' + result);
              }
            } catch (e) {
              console.error('Erro processando evento:', e);
              eventSource.close();
              clearTimeout(timeoutId);
              reject(e);
            }
          };

          eventSource.onerror = (error) => {
            console.error('Erro no EventSource:', error);

            // Implementamos uma lógica de retry
            retryCount++;

            if (retryCount <= maxRetries) {
              console.log(`Tentativa ${retryCount}/${maxRetries} de reconexão...`);
              // O EventSource tenta reconectar automaticamente
              return;
            }

            // Se excedeu o número de retries, fechamos a conexão
            eventSource.close();
            clearTimeout(timeoutId);

            // Se já temos algum resultado, usamos ele mesmo incompleto
            if (result && result.trim() !== '') {
              console.log('Usando resultado parcial obtido até o momento');
              onAnalysisComplete(result);
              resolve('partial-success');
            } else {
              reject(error);
            }
          };
        })
        .catch((error) => {
          console.error('Erro na configuração do EventSource:', error);
          reject(error);
        });
    });
  };

  // Função para processar usando o fetch tradicional (fallback)
  const processWithFetch = async (
    formData: FormData,
    onAnalysisComplete: (text: string) => void,
    toastId: string,
  ): Promise<void> => {
    // Tentativa com fetch tradicional
    const response = await fetch('/api/ui-analysis', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Erro na resposta do servidor: ${response.status} ${response.statusText}`);
    }

    console.log('Resposta recebida, processando texto completo');

    // Obtém o texto completo da resposta
    const text = await response.text();
    console.log('Resposta completa recebida, tamanho:', text.length);
    console.log('Amostra da resposta:', text.substring(0, 200));

    // Processar o texto SSE recebido para extrair os dados
    const lines = text.split('\n');
    let result = '';

    console.log(`Processando ${lines.length} linhas de resposta`);

    // Processar linha por linha para extrair os dados do formato SSE
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.substring(6); // Remover 'data: '

        if (data === '[DONE]') {
          continue;
        }

        try {
          result += data;

          // Verifica se o resultado contém as tags esperadas antes de atualizar
          const containsStructure =
            result.includes('<summary_title>') &&
            result.includes('<image_analysis>') &&
            result.includes('<development_planning>') &&
            result.includes('<implementation_requirements>');

          // Atualiza o texto no input incrementalmente
          if (containsStructure) {
            onAnalysisComplete(result);
          } else if (result.trim() !== '') {
            // Se ainda não temos a estrutura completa, continuamos mostrando a mensagem de processamento
            onAnalysisComplete('Gerando análise da interface UI/UX...\n\n' + result);
          }
        } catch (e) {
          console.error('Erro processando linha:', e);
        }
      }
    }

    // Se ainda não temos resultados, verificar se o texto bruto contém o formato esperado
    if (!result || result.trim() === '') {
      console.log('Tentando extrair texto da resposta bruta...');

      // Se o texto contém o formato esperado, use-o diretamente
      if (
        text.includes('<summary_title>') ||
        text.includes('<image_analysis>') ||
        text.includes('<development_planning>') ||
        text.includes('<implementation_requirements>')
      ) {
        result = text;
        onAnalysisComplete(result);
      } else {
        throw new Error('Nenhum texto foi gerado pela análise');
      }
    }

    // Finalização
    console.log('Análise concluída com sucesso, tamanho do resultado:', result.length);

    toast.update(toastId, {
      render: (
        <div>
          <div className="font-bold">Análise concluída!</div>
          <div className="text-xs text-gray-200 bg-gray-800 p-2 mt-1 rounded">
            Prompt estruturado gerado com sucesso.
          </div>
        </div>
      ),
      type: 'success',
      autoClose: 2000,
    });
  };

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          onClick={analyzeUI}
          disabled={disabled || isAnalyzing}
          className={`absolute top-0 left-0 z-10 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-700 
                      rounded-bl-md rounded-tr-md p-1 shadow-md transition-colors flex items-center justify-center
                      ${isAnalyzing ? 'cursor-wait' : 'cursor-pointer'}
                      animate-pulse-slow border border-indigo-500`}
        >
          {isAnalyzing ? (
            <div className="i-svg-spinners:90-ring-with-bg text-white text-sm animate-spin"></div>
          ) : (
            <div className="i-ph:magic-wand text-white text-sm"></div>
          )}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary p-2 rounded-md text-xs border border-bolt-elements-borderColor max-w-xs"
          sideOffset={5}
        >
          <p className="font-semibold">Analisar UI/UX</p>
          <div className="text-bolt-elements-textSecondary mt-1">
            Gera um prompt estruturado baseado na imagem de interface
          </div>
          <Tooltip.Arrow className="fill-bolt-elements-background-depth-3" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
};

export default uiAnalysisButton;