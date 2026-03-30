import React, { useEffect, useState } from 'react';

interface FullscreenManagerProps {
  examActive: boolean;
  onViolation: () => void;
  children: React.ReactNode;
}

export const FullscreenManager: React.FC<FullscreenManagerProps> = ({
  examActive,
  onViolation,
  children,
}) => {
  const [fullscreenLost, setFullscreenLost] = useState(false);
  const [violationMsg, setViolationMsg] = useState('');

  const goFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFullscreenLost(false);
        setViolationMsg('');
      }
    } catch (err) {
      console.log('Fullscreen request denied');
    }
  };

  const registerViolation = (msg: string) => {
    setViolationMsg(msg);
    setFullscreenLost(true);
    onViolation();
  };

  useEffect(() => {
    if (examActive) {
      goFullscreen();
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    }
  }, [examActive]);

  useEffect(() => {
    if (!examActive) return;

    const handleVisibility = () => {
      if (document.hidden) {
        if (!document.fullscreenElement) {
          registerViolation('You switched tab! Return to fullscreen.');
        } else {
          onViolation();
        }
      }
    };

    const handleContext = (e: MouseEvent) => e.preventDefault();

    const handleKeys = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.key === 'u')
      ) {
        e.preventDefault();
        registerViolation('Developer tools are not allowed during the exam!');
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && examActive) {
        registerViolation('Fullscreen lost! Click below to return.');
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('contextmenu', handleContext);
    document.addEventListener('keydown', handleKeys);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('contextmenu', handleContext);
      document.removeEventListener('keydown', handleKeys);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [examActive]);

  if (!examActive) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      {fullscreenLost && violationMsg && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md text-center">
            <div className="mb-4">
              <svg
                className="w-16 h-16 text-red-600 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-4">Violation Detected!</h3>
            <p className="text-gray-600 mb-6">{violationMsg}</p>
            <button
              onClick={goFullscreen}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition"
            >
              Return to Fullscreen
            </button>
          </div>
        </div>
      )}
    </>
  );
};
