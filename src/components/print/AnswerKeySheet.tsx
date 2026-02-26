import { renderMathText, fixEncodingCorruption } from '@/lib/mathRenderer';

interface GeneratedQuestion {
  questionNumber: number;
  topic: string;
  standard: string;
  question: string;
  answer?: string;
  difficulty: 'medium' | 'hard' | 'challenging';
  bloomLevel?: string;
  advancementLevel?: string;
}

interface AnswerKeySheetProps {
  questions: GeneratedQuestion[];
  worksheetTitle: string;
  teacherName?: string;
  /** 'clean' = teacher reference, 'filled' = mimics completed student paper */
  format: 'clean' | 'filled';
  marginIn?: number;
}

/**
 * Renders answer solutions in a handwriting-style font (Caveat/Patrick Hand).
 * Two formats:
 * - "clean": A teacher reference sheet with neatly organized solutions
 * - "filled": Mimics a completed student worksheet with answers in work area + final answer boxes
 */
export function AnswerKeySheet({
  questions,
  worksheetTitle,
  teacherName,
  format,
  marginIn = 0.75,
}: AnswerKeySheetProps) {
  const questionsWithAnswers = questions.filter(q => q.answer);
  
  if (questionsWithAnswers.length === 0) return null;

  const handwritingFont = "'Caveat', 'Patrick Hand', cursive";
  const printFont = "'Helvetica', 'Arial', sans-serif";

  /** Parse multi-line answer into steps */
  const parseAnswer = (answer: string) => {
    const lines = answer.split('\n').filter(l => l.trim());
    const steps: string[] = [];
    let finalAnswer = '';
    
    for (const line of lines) {
      if (line.includes('**Final Answer') || line.includes('Final Answer:')) {
        finalAnswer = line.replace(/\*\*/g, '').replace('Final Answer:', '').trim();
      } else {
        steps.push(line.replace(/\*\*/g, ''));
      }
    }
    
    if (!finalAnswer && steps.length > 0) {
      finalAnswer = steps.pop() || '';
    }
    
    return { steps, finalAnswer };
  };

  if (format === 'filled') {
    return (
      <div
        className="print-worksheet bg-white text-black"
        style={{
          pageBreakBefore: 'always',
          padding: `${marginIn}in`,
          maxWidth: '8.5in',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: printFont, margin: 0 }}>
                {worksheetTitle}
              </h1>
              <p style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600, fontFamily: printFont, margin: '0.25rem 0 0' }}>
                📋 ANSWER KEY — Filled Worksheet Format
              </p>
            </div>
            <div style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#fef2f2',
              border: '2px solid #dc2626',
              borderRadius: '0.5rem',
              fontFamily: printFont,
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#dc2626',
              textTransform: 'uppercase',
            }}>
              🔒 Teacher Use Only
            </div>
          </div>
          {teacherName && (
            <p style={{ fontSize: '0.85rem', color: '#4b5563', fontFamily: printFont }}>
              Teacher: {teacherName}
            </p>
          )}
          <p style={{ fontSize: '0.7rem', color: '#9ca3af', fontFamily: printFont }}>
            Scan this sheet first to calibrate AI grading • Generated {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Questions with filled answers */}
        <div style={{ fontFamily: 'Georgia, serif' }}>
          {questionsWithAnswers.map((q) => {
            const { steps, finalAnswer } = parseAnswer(q.answer || '');
            return (
              <div key={q.questionNumber} style={{ marginBottom: '1.5rem' }}>
                {/* Question text */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem', fontFamily: printFont }}>
                    {q.questionNumber}.
                  </span>
                  <span style={{ fontSize: '0.95rem' }}>
                    {renderMathText(fixEncodingCorruption(q.question))}
                  </span>
                </div>

                {/* AI-Optimized Answer Box with handwritten solutions */}
                <div style={{
                  border: '3px solid #1e3a5f',
                  borderRadius: '0.5rem',
                  overflow: 'hidden',
                }}>
                  {/* Work Area with handwritten steps */}
                  <div style={{
                    borderBottom: '2px dashed #94a3b8',
                    padding: '0.75rem 1rem',
                    backgroundColor: '#f8fafc',
                    position: 'relative',
                  }}>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: '#1e3a5f',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      fontFamily: printFont,
                      backgroundColor: '#e0f2fe',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #7dd3fc',
                    }}>
                      ✏️ Work Area Q{q.questionNumber}
                    </span>
                    
                    {/* Handwritten work steps */}
                    <div style={{
                      fontFamily: handwritingFont,
                      fontSize: '1.15rem',
                      color: '#1a365d',
                      lineHeight: '2',
                      marginTop: '0.5rem',
                      paddingLeft: '0.5rem',
                    }}>
                      {steps.map((step, i) => (
                        <div key={i} style={{
                          borderBottom: '1px solid #cbd5e1',
                          paddingBottom: '0.15rem',
                        }}>
                          {renderMathText(fixEncodingCorruption(step))}
                        </div>
                      ))}
                    </div>

                    {/* Corner zone markers */}
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '12px', height: '12px', borderLeft: '2px solid #1e3a5f', borderTop: '2px solid #1e3a5f' }} />
                    <div style={{ position: 'absolute', top: 0, right: 0, width: '12px', height: '12px', borderRight: '2px solid #1e3a5f', borderTop: '2px solid #1e3a5f' }} />
                  </div>

                  {/* Final Answer in handwriting */}
                  <div style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#fef3c7',
                    borderTop: '2px solid #f59e0b',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#92400e',
                        textTransform: 'uppercase',
                        fontFamily: printFont,
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
                        fontFamily: handwritingFont,
                        fontSize: '1.3rem',
                        fontWeight: 600,
                        color: '#1a365d',
                        borderBottom: '2px solid #d97706',
                        backgroundColor: '#fffbeb',
                        padding: '0.25rem 0.5rem',
                      }}>
                        {renderMathText(fixEncodingCorruption(finalAnswer))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '2rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid #e5e7eb',
          textAlign: 'center',
          fontSize: '0.65rem',
          color: '#9ca3af',
          fontFamily: printFont,
        }}>
          Answer Key — {worksheetTitle} • Generated with NYCLogic Ai • {new Date().toLocaleDateString()}
        </div>
      </div>
    );
  }

  // Clean format — teacher reference sheet
  return (
    <div
      className="print-worksheet bg-white text-black"
      style={{
        pageBreakBefore: 'always',
        padding: `${marginIn}in`,
        maxWidth: '8.5in',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: printFont, margin: 0 }}>
          ANSWER KEY
        </h2>
        <p style={{ fontSize: '1rem', color: '#4b5563', fontFamily: printFont, margin: '0.25rem 0' }}>
          {worksheetTitle}
        </p>
        {teacherName && (
          <p style={{ fontSize: '0.85rem', color: '#6b7280', fontFamily: printFont }}>
            Teacher: {teacherName}
          </p>
        )}
        <p style={{ fontSize: '0.75rem', color: '#dc2626', fontStyle: 'italic', fontFamily: printFont, marginTop: '0.5rem' }}>
          FOR TEACHER USE ONLY — Do not distribute to students
        </p>
        <p style={{ fontSize: '0.65rem', color: '#9ca3af', fontFamily: printFont }}>
          Created: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Solutions */}
      <div>
        {questionsWithAnswers.map((q) => {
          const { steps, finalAnswer } = parseAnswer(q.answer || '');
          return (
            <div key={q.questionNumber} style={{
              marginBottom: '1.25rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid #e5e7eb',
            }}>
              {/* Question header */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{
                  fontWeight: 700,
                  fontSize: '1rem',
                  fontFamily: printFont,
                  backgroundColor: '#f3f4f6',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '0.25rem',
                }}>
                  Q{q.questionNumber}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontFamily: printFont, fontStyle: 'italic' }}>
                  {q.topic} • {q.standard}
                </span>
              </div>

              {/* Worked solution in handwriting */}
              <div style={{
                fontFamily: handwritingFont,
                fontSize: '1.1rem',
                color: '#1e3a5f',
                lineHeight: '1.8',
                marginLeft: '1rem',
                padding: '0.5rem',
                backgroundColor: '#fafafa',
                borderRadius: '0.375rem',
                borderLeft: '3px solid #3b82f6',
              }}>
                {steps.map((step, i) => (
                  <div key={i}>{renderMathText(fixEncodingCorruption(step))}</div>
                ))}
                {finalAnswer && (
                  <div style={{
                    marginTop: '0.5rem',
                    paddingTop: '0.5rem',
                    borderTop: '2px solid #10b981',
                    fontWeight: 700,
                    fontSize: '1.2rem',
                    color: '#065f46',
                  }}>
                    ✅ {renderMathText(fixEncodingCorruption(finalAnswer))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '2rem',
        paddingTop: '0.75rem',
        borderTop: '1px solid #e5e7eb',
        textAlign: 'center',
        fontSize: '0.65rem',
        color: '#9ca3af',
        fontFamily: printFont,
      }}>
        Answer Key — {worksheetTitle} • Generated with NYCLogic Ai • {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}
