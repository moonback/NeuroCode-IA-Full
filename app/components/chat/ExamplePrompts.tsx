import React from 'react';

const EXAMPLE_PROMPTS = [
  { text: 'Create a modern landing page with React and Tailwind CSS', category: 'Web' },
  { text: 'Build a REST API with Node.js and Express', category: 'Backend' },
  { text: 'Design a responsive dashboard using Next.js', category: 'Web' },
  { text: 'Create a real-time chat application with Socket.io', category: 'Full Stack' },
  { text: 'Build a mobile app with React Native', category: 'Mobile' },
  { text: 'Implement user authentication with JWT', category: 'Security' },
];

export function ExamplePrompts(sendMessage?: { (event: React.UIEvent, messageInput?: string): void | undefined }) {
  return (
    <div id="examples" className="relative flex flex-col gap-6 w-full max-w-4xl mx-auto mt-8">
      <h3 className="text-center text-lg font-medium text-gray-700 dark:text-gray-300">
      Essayez ces exemples de prompts
      </h3>
      <div
        className="flex flex-wrap justify-center gap-3"
        style={{
          animation: '.25s ease-out 0s 1 _fade-and-move-in_g2ptj_1 forwards',
        }}
      >
        {EXAMPLE_PROMPTS.map((examplePrompt, index: number) => {
          return (
            <button
              key={index}
              onClick={(event) => {
                sendMessage?.(event, examplePrompt.text);
              }}
              className="relative group border border-bolt-elements-borderColor rounded-lg bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary px-4 py-2 text-sm transition-all duration-200 hover:shadow-md"
            >
              <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs bg-violet-500 text-white rounded-full">
                {examplePrompt.category}
              </span>
              {examplePrompt.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
