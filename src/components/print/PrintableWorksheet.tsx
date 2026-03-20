import { StudentQRCode } from './StudentQRCode';
import { StudentOnlyQRCode } from './StudentOnlyQRCode';
import { StudentPageQRCode } from './StudentPageQRCode';
import { renderMathText } from '@/lib/mathRenderer';

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  student_id: string | null;
}

interface Question {
  id: string;
  jmap_id: string | null;
  prompt_text: string | null;
  prompt_image_url: string | null;
  topicName?: string; // For multi-topic training forms
  standard?: string; // For displaying standard info
}

// Advancement levels A-F (A is best, F is lowest)
type AdvancementLevel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

const LEVEL_COLORS: Record<AdvancementLevel, { bg: string; text: string; border: string }> = {
  A: { bg: '#dcfce7', text: '#166534', border: '#16a34a' },
  B: { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
  C: { bg: '#fef9c3', text: '#854d0e', border: '#eab308' },
  D: { bg: '#fed7aa', text: '#9a3412', border: '#f97316' },
  E: { bg: '#fecaca', text: '#991b1b', border: '#ef4444' },
  F: { bg: '#fecdd3', text: '#9f1239', border: '#e11d48' },
};

const LEVEL_DESCRIPTIONS: Record<AdvancementLevel, string> = {
  A: 'Advanced - Exceptional mastery, ready for enrichment',
  B: 'Proficient - Strong understanding, minor gaps',
  C: 'Developing - Solid foundation, needs practice',
  D: 'Approaching - Basic understanding, requires support',
  E: 'Beginning - Foundational skills emerging',
  F: 'Needs Intervention - Requires intensive support',
};

// Answer format types for structured student responses
export type AnswerFormat = 'ai_optimized' | 'step_by_step' | 'grid_cell' | 'dual_zone';

interface PrintableWorksheetProps {
  student: Student;
  questions: Question[];
  assessmentName?: string;
  showAnswerBox?: boolean;
  showQRCodes?: boolean;
  studentLevel?: AdvancementLevel | null;
  topicName?: string;
  standard?: string;
  teacherName?: string;
  aiOptimizedLayout?: boolean; // Enable AI-optimized bounded answer zones
  answerFormat?: AnswerFormat; // Structured answer format selection
  pageNumber?: number; // For multi-page worksheets - current page
  totalPages?: number; // For multi-page worksheets - total pages
  hideLevelFromStudent?: boolean; // Hide level indicator except for Advanced (A) students
}

export function PrintableWorksheet({ 
  student, 
  questions, 
  assessmentName = 'Assessment',
  showAnswerBox = true,
  showQRCodes = true,
  studentLevel,
  topicName,
  standard,
  teacherName,
  aiOptimizedLayout = true,
  answerFormat = 'ai_optimized',
  pageNumber = 1,
  totalPages = 1,
  hideLevelFromStudent = true,
}: PrintableWorksheetProps) {
  const levelInfo = studentLevel ? LEVEL_COLORS[studentLevel] : null;
  const levelDescription = studentLevel ? LEVEL_DESCRIPTIONS[studentLevel] : null;
  
  // Only show level to students if they are Advanced (A) OR if explicitly allowed
  const shouldShowLevelToStudent = studentLevel && levelInfo && (!hideLevelFromStudent || studentLevel === 'A');
  
  // AI-Optimized Answer Box Component with clear boundaries
  const AIOptimizedAnswerBox = ({ questionNumber }: { questionNumber: number }) => (
    <div style={{
      border: '3px solid #1e3a5f',
      borderRadius: '0.5rem',
      marginTop: '1rem',
      backgroundColor: '#ffffff',
      overflow: 'hidden',
    }}>
      {/* Work Area Section */}
      <div style={{
        borderBottom: '2px dashed #94a3b8',
        padding: '0.75rem 1rem',
        backgroundColor: '#f8fafc',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#1e3a5f',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontFamily: 'Helvetica, Arial, sans-serif',
            backgroundColor: '#e0f2fe',
            padding: '0.2rem 0.6rem',
            borderRadius: '0.25rem',
            border: '1px solid #7dd3fc',
          }}>
            ✏️ Work Area Q{questionNumber}
          </span>
          <span style={{
            fontSize: '0.65rem',
            color: '#64748b',
            fontStyle: 'italic',
            fontFamily: 'Helvetica, Arial, sans-serif',
          }}>
            Show all calculations & reasoning here
          </span>
        </div>
        {/* Work lines with zone indicator */}
        <div style={{ 
          minHeight: '100px',
          position: 'relative',
        }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{
              borderBottom: '1px solid #cbd5e1',
              height: '1.25rem',
            }} />
          ))}
          {/* Corner zone markers for AI scanning */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '12px',
            height: '12px',
            borderLeft: '2px solid #1e3a5f',
            borderTop: '2px solid #1e3a5f',
          }} />
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '12px',
            height: '12px',
            borderRight: '2px solid #1e3a5f',
            borderTop: '2px solid #1e3a5f',
          }} />
        </div>
      </div>
      
      {/* Final Answer Section */}
      <div style={{
        padding: '0.75rem 1rem',
        backgroundColor: '#fef3c7',
        borderTop: '2px solid #f59e0b',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <span style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#92400e',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontFamily: 'Helvetica, Arial, sans-serif',
            backgroundColor: '#fde68a',
            padding: '0.25rem 0.75rem',
            borderRadius: '0.25rem',
            border: '2px solid #f59e0b',
            whiteSpace: 'nowrap',
          }}>
            📝 Final Answer
          </span>
          <div style={{
            flex: 1,
            borderBottom: '2px solid #d97706',
            minHeight: '1.5rem',
            backgroundColor: '#fffbeb',
            padding: '0.25rem 0.5rem',
          }} />
        </div>
      </div>
    </div>
  );
  
  // Standard Answer Box (original style)
  const StandardAnswerBox = () => (
    <div style={{ 
      border: '2px solid #9ca3af',
      borderRadius: '0.375rem',
      padding: '1rem 1.25rem',
      marginTop: '0.875rem',
      minHeight: '120px',
      backgroundColor: '#fefefe',
    }}>
      <p style={{ 
        fontSize: '0.8rem', 
        color: '#6b7280', 
        marginBottom: '0.75rem',
        fontStyle: 'italic',
        fontFamily: 'Helvetica, Arial, sans-serif',
        borderBottom: '1px dashed #d1d5db',
        paddingBottom: '0.5rem',
      }}>
        Show your work clearly below:
      </p>
      {/* Lined writing area */}
      <div style={{ minHeight: '80px' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{
            borderBottom: '1px solid #e5e7eb',
            height: '1.5rem',
            marginBottom: '0.25rem',
          }} />
        ))}
      </div>
    </div>
  );

  // Step-by-Step Answer Box — forces students to show discrete work steps
  const StepByStepAnswerBox = ({ questionNumber }: { questionNumber: number }) => (
    <div style={{
      border: '3px solid #1e3a5f',
      borderRadius: '0.5rem',
      marginTop: '1rem',
      backgroundColor: '#ffffff',
      overflow: 'hidden',
    }}>
      {[1, 2, 3].map((step) => (
        <div key={step} style={{
          borderBottom: step < 3 ? '2px dashed #94a3b8' : 'none',
          padding: '0.5rem 1rem',
          backgroundColor: step === 1 ? '#f0f9ff' : step === 2 ? '#f8fafc' : '#ffffff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, color: '#1e3a5f', textTransform: 'uppercase',
              letterSpacing: '0.08em', fontFamily: 'Helvetica, Arial, sans-serif',
              backgroundColor: '#dbeafe', padding: '0.15rem 0.5rem', borderRadius: '0.25rem',
              border: '1px solid #93c5fd',
            }}>Step {step}</span>
            <span style={{ fontSize: '0.6rem', color: '#64748b', fontStyle: 'italic', fontFamily: 'Helvetica, Arial, sans-serif' }}>
              {step === 1 ? 'Set up / identify what is given' : step === 2 ? 'Show your calculation or reasoning' : 'Solve and simplify'}
            </span>
          </div>
          <div style={{ minHeight: '40px', position: 'relative' }}>
            {[...Array(2)].map((_, i) => (
              <div key={i} style={{ borderBottom: '1px solid #cbd5e1', height: '1.1rem' }} />
            ))}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '10px', height: '10px', borderLeft: '2px solid #1e3a5f', borderTop: '2px solid #1e3a5f' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: '10px', height: '10px', borderRight: '2px solid #1e3a5f', borderTop: '2px solid #1e3a5f' }} />
          </div>
        </div>
      ))}
      <div style={{ padding: '0.6rem 1rem', backgroundColor: '#fef3c7', borderTop: '2px solid #f59e0b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            fontSize: '0.8rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase',
            letterSpacing: '0.05em', fontFamily: 'Helvetica, Arial, sans-serif',
            backgroundColor: '#fde68a', padding: '0.25rem 0.75rem', borderRadius: '0.25rem',
            border: '2px solid #f59e0b', whiteSpace: 'nowrap',
          }}>📝 Final Answer</span>
          <div style={{ flex: 1, borderBottom: '2px solid #d97706', minHeight: '1.5rem', backgroundColor: '#fffbeb', padding: '0.25rem 0.5rem' }} />
        </div>
      </div>
    </div>
  );

  // Dual-Zone Answer Box — work area left, final answer column right
  const DualZoneAnswerBox = ({ questionNumber }: { questionNumber: number }) => (
    <div style={{
      border: '3px solid #1e3a5f', borderRadius: '0.5rem', marginTop: '1rem',
      backgroundColor: '#ffffff', overflow: 'hidden', display: 'flex',
    }}>
      <div style={{
        flex: 7, borderRight: '3px solid #1e3a5f', padding: '0.6rem 0.75rem',
        backgroundColor: '#f8fafc', position: 'relative',
      }}>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, color: '#1e3a5f', textTransform: 'uppercase',
          letterSpacing: '0.08em', fontFamily: 'Helvetica, Arial, sans-serif',
          backgroundColor: '#e0f2fe', padding: '0.15rem 0.5rem', borderRadius: '0.25rem',
          border: '1px solid #7dd3fc',
        }}>✏️ Work Area</span>
        <div style={{ minHeight: '100px', marginTop: '0.5rem' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ borderBottom: '1px solid #cbd5e1', height: '1.2rem' }} />
          ))}
        </div>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '10px', height: '10px', borderLeft: '2px solid #1e3a5f', borderTop: '2px solid #1e3a5f' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '10px', height: '10px', borderLeft: '2px solid #1e3a5f', borderBottom: '2px solid #1e3a5f' }} />
      </div>
      <div style={{
        flex: 3, padding: '0.6rem 0.75rem', backgroundColor: '#fef3c7',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        alignItems: 'center', textAlign: 'center', position: 'relative',
      }}>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase',
          letterSpacing: '0.05em', fontFamily: 'Helvetica, Arial, sans-serif', marginBottom: '0.5rem',
        }}>📝 Final<br/>Answer</span>
        <div style={{
          width: '90%', minHeight: '50px', borderBottom: '2px solid #d97706',
          backgroundColor: '#fffbeb', padding: '0.25rem',
        }} />
        <div style={{ position: 'absolute', top: 0, right: 0, width: '10px', height: '10px', borderRight: '2px solid #f59e0b', borderTop: '2px solid #f59e0b' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', borderRight: '2px solid #f59e0b', borderBottom: '2px solid #f59e0b' }} />
      </div>
    </div>
  );

  // Grid-Cell Answer Box — one character per cell for precise AI reading
  const GridCellAnswerBox = ({ questionNumber }: { questionNumber: number }) => (
    <div style={{
      border: '3px solid #1e3a5f', borderRadius: '0.5rem', marginTop: '1rem',
      backgroundColor: '#ffffff', overflow: 'hidden',
    }}>
      <div style={{ borderBottom: '2px dashed #94a3b8', padding: '0.5rem 1rem', backgroundColor: '#f8fafc' }}>
        <span style={{
          fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
          letterSpacing: '0.08em', fontFamily: 'Helvetica, Arial, sans-serif',
        }}>Scratch Work (optional)</span>
        <div style={{ minHeight: '50px' }}>
          {[...Array(2)].map((_, i) => (
            <div key={i} style={{ borderBottom: '1px solid #e2e8f0', height: '1.2rem' }} />
          ))}
        </div>
      </div>
      <div style={{ padding: '0.6rem 1rem', backgroundColor: '#fef3c7', borderTop: '2px solid #f59e0b' }}>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase',
          letterSpacing: '0.05em', fontFamily: 'Helvetica, Arial, sans-serif',
          display: 'block', marginBottom: '0.5rem',
        }}>📝 Write your final answer — one character per cell:</span>
        <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[...Array(14)].map((_, i) => (
            <div key={i} style={{
              width: '28px', height: '34px', border: '2px solid #d97706',
              backgroundColor: '#fffbeb', borderRadius: '3px',
            }} />
          ))}
        </div>
        <p style={{
          fontSize: '0.55rem', color: '#92400e', marginTop: '0.35rem', textAlign: 'center',
          fontFamily: 'Helvetica, Arial, sans-serif', fontStyle: 'italic',
        }}>One cell per digit, letter, symbol, decimal point, or fraction bar</p>
      </div>
    </div>
  );

  // Resolve which answer box to render
  const renderAnswerBox = (questionNumber: number) => {
    if (!showAnswerBox) return null;
    switch (answerFormat) {
      case 'step_by_step': return <StepByStepAnswerBox questionNumber={questionNumber} />;
      case 'grid_cell': return <GridCellAnswerBox questionNumber={questionNumber} />;
      case 'dual_zone': return <DualZoneAnswerBox questionNumber={questionNumber} />;
      case 'ai_optimized':
      default:
        return aiOptimizedLayout ? <AIOptimizedAnswerBox questionNumber={questionNumber} /> : <StandardAnswerBox />;
    }
  };

  return (
    <div 
      className="print-worksheet bg-white text-black min-h-screen" 
      style={{ 
        pageBreakAfter: 'always',
        padding: '0.75in 1in',
        maxWidth: '8.5in',
        margin: '0 auto',
        boxSizing: 'border-box',
        fontFamily: 'Georgia, Times New Roman, serif',
      }}
    >
      {/* Enhanced Header with Topic & Standard Banner */}
      <div style={{ marginBottom: '1.5rem' }}>
        {/* Title Block */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1rem',
        }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ 
              fontSize: '1.75rem', 
              fontWeight: 'bold', 
              margin: 0,
              fontFamily: 'Helvetica, Arial, sans-serif',
              letterSpacing: '-0.02em',
            }}>
              {assessmentName}
            </h1>
            {teacherName && (
              <p style={{ 
                fontSize: '0.875rem', 
                color: '#4b5563', 
                margin: '0.25rem 0 0 0',
                fontFamily: 'Helvetica, Arial, sans-serif',
              }}>
                Teacher: {teacherName}
              </p>
            )}
          </div>
          
          {/* Student Identification QR Code - Top Right Corner */}
          {/* Uses page-aware QR for multi-page documents (front/back identification) */}
          {showQRCodes && (
            <div style={{ 
              flexShrink: 0, 
              textAlign: 'center',
              marginLeft: '1rem',
            }}>
              {totalPages > 1 ? (
                <StudentPageQRCode 
                  studentId={student.id} 
                  pageNumber={pageNumber}
                  totalPages={totalPages}
                  size={84} 
                />
              ) : (
                <>
                  <StudentOnlyQRCode studentId={student.id} size={88} />
                  <p style={{ 
                    fontSize: '0.6rem', 
                    color: '#6b7280', 
                    marginTop: '0.15rem', 
                    fontWeight: 600,
                    fontFamily: 'Helvetica, Arial, sans-serif',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    Student ID
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Topic & Standard Banner - Highly Visible */}
        {(topicName || standard) && (
          <div style={{
            background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)',
            color: 'white',
            padding: '0.875rem 1.25rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              {topicName && (
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <p style={{ 
                    fontSize: '0.7rem', 
                    opacity: 0.85, 
                    margin: 0, 
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    fontFamily: 'Helvetica, Arial, sans-serif',
                  }}>
                    Topic Focus
                  </p>
                  <p style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: 'bold', 
                    margin: '0.15rem 0 0 0',
                    fontFamily: 'Helvetica, Arial, sans-serif',
                  }}>
                    {topicName}
                  </p>
                </div>
              )}
              {standard && (
                <div style={{ 
                  textAlign: topicName ? 'right' : 'left',
                  background: 'rgba(255,255,255,0.15)',
                  padding: '0.5rem 0.875rem',
                  borderRadius: '0.375rem',
                }}>
                  <p style={{ 
                    fontSize: '0.65rem', 
                    opacity: 0.9, 
                    margin: 0, 
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    fontFamily: 'Helvetica, Arial, sans-serif',
                  }}>
                    Standard
                  </p>
                  <p style={{ 
                    fontSize: '0.95rem', 
                    fontWeight: 600, 
                    margin: '0.1rem 0 0 0',
                    fontFamily: 'monospace',
                  }}>
                    {standard}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Student Info Section */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          backgroundColor: '#f8fafc',
          border: '2px solid #e2e8f0',
          borderRadius: '0.5rem',
        }}>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <span style={{ 
                fontSize: '0.7rem', 
                color: '#64748b', 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em',
                fontFamily: 'Helvetica, Arial, sans-serif',
              }}>
                Student Name
              </span>
              <p style={{ 
                fontSize: '1.125rem', 
                fontWeight: 'bold', 
                margin: '0.1rem 0 0 0',
                fontFamily: 'Helvetica, Arial, sans-serif',
              }}>
                {student.first_name} {student.last_name}
              </p>
            </div>
            {student.student_id && (
              <div>
                <span style={{ 
                  fontSize: '0.7rem', 
                  color: '#64748b', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.05em',
                  fontFamily: 'Helvetica, Arial, sans-serif',
                }}>
                  ID
                </span>
                <p style={{ 
                  fontSize: '1rem', 
                  fontWeight: '500', 
                  margin: '0.1rem 0 0 0',
                  fontFamily: 'monospace',
                }}>
                  {student.student_id}
                </p>
              </div>
            )}
          </div>
          <div style={{ 
            display: 'flex', 
            gap: '1.5rem', 
            color: '#64748b',
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontSize: '0.875rem',
          }}>
            <span>Date: _______________</span>
            <span>Period: _______</span>
          </div>
        </div>

        {/* Worksheet Created Date & Tracking ID */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0.25rem 1rem 0',
          fontSize: '0.65rem',
          color: '#9ca3af',
          fontFamily: 'Helvetica, Arial, sans-serif',
        }}>
          <span>Worksheet Created: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          <span>ID: WS-{Date.now().toString(36).toUpperCase().slice(-6)}</span>
        </div>
      </div>

      {/* Student Level Indicator - Only shown for Advanced students or when explicitly allowed */}
      {shouldShowLevelToStudent && (
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.875rem 1.25rem',
            marginBottom: '1.5rem',
            borderRadius: '0.5rem',
            backgroundColor: levelInfo.bg,
            border: `2px solid ${levelInfo.border}`,
          }}
        >
          <div 
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              backgroundColor: levelInfo.border,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.75rem',
              fontWeight: 'bold',
              flexShrink: 0,
              fontFamily: 'Helvetica, Arial, sans-serif',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            ⭐
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ 
              margin: 0, 
              fontWeight: 'bold', 
              fontSize: '1.0625rem',
              color: levelInfo.text,
              fontFamily: 'Helvetica, Arial, sans-serif',
            }}>
              🎉 Advanced Level Challenge!
              {topicName && <span style={{ fontWeight: 'normal' }}> in {topicName}</span>}
            </p>
            <p style={{ 
              margin: '0.25rem 0 0 0', 
              fontSize: '0.875rem',
              color: levelInfo.text,
              opacity: 0.9,
              fontFamily: 'Helvetica, Arial, sans-serif',
            }}>
              Great work! You've earned access to advanced problems.
            </p>
          </div>
        </div>
      )}

      {/* AI Scanning Instructions Banner (only for AI-optimized layout) */}
      {aiOptimizedLayout && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.5rem 0.875rem',
          marginBottom: '1rem',
          backgroundColor: '#ecfdf5',
          border: '1px solid #6ee7b7',
          borderRadius: '0.375rem',
          fontSize: '0.7rem',
          color: '#047857',
          fontFamily: 'Helvetica, Arial, sans-serif',
        }}>
          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            📋 Instructions
          </span>
          <span style={{ flex: 1 }}>
            Write all work in the <strong>Work Area</strong> boxes. Put your final answer in the <strong>Final Answer</strong> section.
          </span>
        </div>
      )}

      {/* Separator Line */}
      <div style={{
        height: '2px',
        background: 'linear-gradient(90deg, #1e3a5f 0%, #3b82f6 50%, #1e3a5f 100%)',
        marginBottom: '1.5rem',
        borderRadius: '1px',
      }} />

      {/* Questions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {questions.map((question, index) => (
          <div 
            key={question.id} 
            className="question-block" 
            style={{ 
              pageBreakInside: 'avoid',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {/* Per-question topic indicator (for multi-topic worksheets) */}
            {question.topicName && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: '#dbeafe',
                border: '1px solid #93c5fd',
                borderRadius: '0.375rem',
                padding: '0.25rem 0.75rem',
                marginBottom: '0.5rem',
                fontSize: '0.75rem',
                color: '#1e40af',
                fontWeight: 600,
                fontFamily: 'Helvetica, Arial, sans-serif',
              }}>
                <span style={{ opacity: 0.7 }}>Topic:</span>
                <span>{question.topicName}</span>
                {question.standard && (
                  <>
                    <span style={{ opacity: 0.5 }}>•</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{question.standard}</span>
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
              {/* QR Code - Left side */}
              {showQRCodes && (
                <div style={{ 
                  flexShrink: 0, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center',
                  marginRight: '0.5rem',
                }}>
                  <StudentQRCode 
                    studentId={student.id} 
                    questionId={question.id} 
                    size={80}
                  />
                  <p style={{ 
                    fontSize: '0.75rem', 
                    color: '#1e3a5f', 
                    marginTop: '0.25rem', 
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontFamily: 'Helvetica, Arial, sans-serif',
                    backgroundColor: '#e0f2fe',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '0.25rem',
                  }}>
                    Q{index + 1}
                  </p>
                </div>
              )}

              {/* Question Content */}
              <div style={{ 
                flex: 1, 
                minWidth: 0,
                maxWidth: showQRCodes ? 'calc(100% - 110px)' : '100%',
                overflow: 'hidden',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
              }}>
                {/* Question Number & Reference */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'baseline', 
                  gap: '0.625rem', 
                  marginBottom: '0.625rem',
                  borderBottom: '1px solid #e5e7eb',
                  paddingBottom: '0.375rem',
                }}>
                  <span style={{ 
                    fontWeight: 'bold', 
                    fontSize: '1.25rem',
                    fontFamily: 'Helvetica, Arial, sans-serif',
                    color: '#1e3a5f',
                  }}>
                    {index + 1}.
                  </span>
                  {question.jmap_id && (
                    <span style={{ 
                      fontSize: '0.8rem', 
                      color: '#6b7280',
                      backgroundColor: '#f3f4f6',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontFamily: 'monospace',
                    }}>
                      Ref: {question.jmap_id}
                    </span>
                  )}
                </div>

                {/* Question Text */}
                {question.prompt_text && (
                  <p style={{ 
                    marginBottom: '0.875rem', 
                    lineHeight: 1.7,
                    fontSize: '1.0625rem',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    whiteSpace: 'pre-wrap',
                    maxWidth: '100%',
                    color: '#1f2937',
                  }}>
                    {renderMathText(question.prompt_text)}
                  </p>
                )}

                {/* Question Image */}
                {question.prompt_image_url && (
                  <img 
                    src={question.prompt_image_url} 
                    alt={`Question ${index + 1}`}
                    style={{ 
                      maxWidth: '100%',
                      maxHeight: '220px',
                      marginBottom: '0.875rem',
                      objectFit: 'contain',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.375rem',
                      padding: '0.5rem',
                      backgroundColor: '#fafafa',
                    }}
                  />
                )}

                {/* Answer Box - AI Optimized or Standard */}
                {showAnswerBox && (
                  aiOptimizedLayout ? (
                    <AIOptimizedAnswerBox questionNumber={index + 1} />
                  ) : (
                    <StandardAnswerBox />
                  )
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ 
        marginTop: '2.5rem',
        paddingTop: '1rem',
        borderTop: '2px solid #1e3a5f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.75rem',
        color: '#6b7280',
        fontFamily: 'Helvetica, Arial, sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontWeight: '600', color: '#374151' }}>
            {student.last_name}, {student.first_name}
          </span>
          {studentLevel && (
            <span style={{
              backgroundColor: levelInfo?.border || '#6b7280',
              color: 'white',
              padding: '0.125rem 0.5rem',
              borderRadius: '0.25rem',
              fontSize: '0.7rem',
              fontWeight: 600,
            }}>
              Level {studentLevel}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {topicName && (
            <span style={{ fontStyle: 'italic' }}>{topicName}</span>
          )}
          <span style={{ fontWeight: '500' }}>{assessmentName}</span>
        </div>
      </div>

      {/* Repeated Topic/Standard Reference at Bottom (helpful for multi-page) */}
      {(topicName || standard) && (
        <div style={{
          marginTop: '1rem',
          padding: '0.5rem 0.75rem',
          backgroundColor: '#f1f5f9',
          borderRadius: '0.25rem',
          display: 'flex',
          justifyContent: 'center',
          gap: '2rem',
          fontSize: '0.7rem',
          color: '#475569',
          fontFamily: 'Helvetica, Arial, sans-serif',
        }}>
          {topicName && (
            <span><strong>Topic:</strong> {topicName}</span>
          )}
          {standard && (
            <span><strong>Standard:</strong> {standard}</span>
          )}
        </div>
      )}
    </div>
  );
}
