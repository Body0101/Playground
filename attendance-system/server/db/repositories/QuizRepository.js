/**
 * db/repositories/QuizRepository.js
 */

'use strict';

class QuizRepository {
  constructor(db) {
    this.db = db;

    this._findById      = db.prepare('SELECT * FROM quizzes WHERE id = ?');
    this._findActive    = db.prepare('SELECT * FROM quizzes WHERE active = 1 LIMIT 1');
    this._listByTa      = db.prepare('SELECT * FROM quizzes WHERE ta_id = ? ORDER BY created_at DESC');

    this._insertQuiz    = db.prepare(`
      INSERT INTO quizzes (ta_id, session_id, title, time_limit)
      VALUES (@taId, @sessionId, @title, @timeLimit)
    `);
    this._insertQuestion = db.prepare(`
      INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, order_num)
      VALUES (@quizId, @question, @a, @b, @c, @d, @correct, @order)
    `);

    this._questionsByQuiz = db.prepare(
      'SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY order_num, id'
    );
    this._questionsByQuizPublic = db.prepare(
      'SELECT id, question, option_a, option_b, option_c, option_d FROM quiz_questions WHERE quiz_id = ? ORDER BY order_num, id'
    );

    this._deactivateAll = db.prepare('UPDATE quizzes SET active = 0');
    this._setActive     = db.prepare('UPDATE quizzes SET active = ? WHERE id = ?');

    this._insertAnswer  = db.prepare(`
      INSERT INTO quiz_answers (quiz_id, question_id, student_id, answer, is_correct)
      VALUES (@quizId, @questionId, @studentId, @answer, @isCorrect)
    `);
    this._hasSubmitted  = db.prepare(
      'SELECT 1 FROM quiz_answers WHERE quiz_id = ? AND student_id = ? LIMIT 1'
    );
    this._resultsByQuiz = db.prepare(`
      SELECT u.name, u.student_id as sid,
        SUM(qa.is_correct) as score,
        COUNT(qa.id)       as total
      FROM quiz_answers qa JOIN users u ON qa.student_id = u.id
      WHERE qa.quiz_id = ?
      GROUP BY qa.student_id ORDER BY score DESC
    `);
    this._studentAnswers = db.prepare(`
      SELECT qa.answer, qa.is_correct, qq.question, qq.correct_answer
      FROM quiz_answers qa JOIN quiz_questions qq ON qa.question_id = qq.id
      WHERE qa.quiz_id = ? AND qa.student_id = ?
    `);

    this._deleteQuiz = db.prepare('DELETE FROM quizzes WHERE id = ?');
  }

  // ─── READ ─────────────────────────────────────────────────────────────────
  findById(id)  { return this._findById.get(id);    }
  findActive()  { return this._findActive.get();    }
  listByTa(taId){ return this._listByTa.all(taId);  }

  findActiveWithQuestions() {
    const quiz = this.findActive();
    if (!quiz) return null;
    return { ...quiz, questions: this._questionsByQuizPublic.all(quiz.id) };
  }

  getQuestions(quizId)       { return this._questionsByQuiz.all(quizId);       }
  getPublicQuestions(quizId) { return this._questionsByQuizPublic.all(quizId); }
  hasSubmitted(quizId, studentId) { return !!this._hasSubmitted.get(quizId, studentId); }
  getResults(quizId)         { return this._resultsByQuiz.all(quizId);         }
  getStudentAnswers(quizId, studentId) { return this._studentAnswers.all(quizId, studentId); }

  // ─── WRITE ────────────────────────────────────────────────────────────────
  /**
   * Create a quiz with its questions atomically.
   * questions: [{ question, a, b, c?, d?, correct:'A'|'B'|'C'|'D' }]
   */
  create({ taId, sessionId = null, title, timeLimit = null, questions = [] }) {
    let quizId;
    const run = this.db.transaction(() => {
      const res = this._insertQuiz.run({ taId, sessionId, title, timeLimit });
      quizId = res.lastInsertRowid;
      questions.forEach((q, i) => {
        this._insertQuestion.run({
          quizId, order: i,
          question: q.question,
          a: q.a, b: q.b,
          c: q.c || null, d: q.d || null,
          correct: q.correct.toUpperCase(),
        });
      });
    });
    run();
    return quizId;
  }

  toggle(quizId) {
    const quiz = this.findById(quizId);
    if (!quiz) throw new Error('Quiz not found');
    const newState = quiz.active ? 0 : 1;
    const run = this.db.transaction(() => {
      if (newState === 1) this._deactivateAll.run();  // only one active at a time
      this._setActive.run(newState, quizId);
    });
    run();
    return !!newState;
  }

  /**
   * Submit a student's answers. Returns { score, total, percentage }.
   * answers: { [questionId]: 'A'|'B'|'C'|'D' }
   */
  submitAnswers({ quizId, studentId, answers }) {
    if (this.hasSubmitted(quizId, studentId)) throw new Error('Already submitted');

    const questions = this.getQuestions(quizId);
    let score = 0;

    const run = this.db.transaction(() => {
      for (const q of questions) {
        const ans = (answers?.[q.id] || '').toUpperCase();
        const correct = ans === q.correct_answer ? 1 : 0;
        if (correct) score++;
        this._insertAnswer.run({ quizId, questionId: q.id, studentId, answer: ans, isCorrect: correct });
      }
    });
    run();

    return {
      score,
      total:      questions.length,
      percentage: questions.length ? Math.round((score / questions.length) * 100) : 0,
    };
  }

  delete(quizId) { this._deleteQuiz.run(quizId); }
}

module.exports = QuizRepository;
