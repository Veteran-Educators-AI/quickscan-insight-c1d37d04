-- 1) Seed the new default Algebra 2 topic names
INSERT INTO public.topics (name, is_default, teacher_id)
SELECT v.name, true, NULL
FROM (VALUES
  ('Completing the Square'),
  ('Quadratic Formula and the Discriminant'),
  ('Complex Roots of Quadratic Equations'),
  ('Vertex Form and Parabola Graphs'),
  ('Linear-Quadratic Systems'),
  ('Quadratic Inequalities'),
  ('Composition of Functions'),
  ('Inverse Functions'),
  ('Even and Odd Functions'),
  ('Piecewise Functions'),
  ('Average Rate of Change'),
  ('Key Features of Graphs'),
  ('Domain and Range of Functions'),
  ('Rational Exponents'),
  ('Properties of Exponents'),
  ('Simplifying Radical Expressions'),
  ('Factoring Polynomials'),
  ('Polynomial Long Division'),
  ('Solving Polynomial Equations'),
  ('End Behavior of Polynomial Graphs'),
  ('Solving Logarithmic Equations'),
  ('Compound Interest and the Number e'),
  ('Comparing Linear, Quadratic and Exponential Models'),
  ('Systems of Three Linear Equations'),
  ('Modeling with Periodic Functions'),
  ('Curve Fitting and Regression Models'),
  ('Normal Curve and z-Scores'),
  ('Simulation and Random Models'),
  ('Surveys, Experiments and Observational Studies'),
  ('Margin of Error'),
  ('Comparing Two Treatments'),
  ('Evaluating Reports Based on Data')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.topics t WHERE t.is_default AND t.teacher_id IS NULL AND t.name = v.name
);

-- 2) Seed 60 Statistics practice questions, linked to the STAT topics
DO $$
DECLARE
  v record;
  qid uuid;
  tid uuid;
  tch uuid := '800d34c5-33be-4c18-8f25-25fb4738717c';
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      ('Represent data with plots on the real number line: dot plots, histograms, box plots','The daily high temperatures (°F) for two weeks were: 58, 61, 61, 64, 67, 67, 67, 70, 72, 72, 75, 78, 81, 90. Make a box plot and label the five-number summary.','Min 58, Q1 = 64, median = 68.5, Q3 = 75, max 90. Box from 64 to 75 with a line at 68.5; whiskers to 58 and 90. Right-skewed because of the 90.',1,'foundation'),
      ('Represent data with plots on the real number line: dot plots, histograms, box plots','A class recorded the number of texts sent in one hour: 0, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 4, 5, 7, 9. Build a dot plot and describe the shape.','Stack dots above 0-9; tallest stacks at 2 and 4. Shape: single peak near 4, skewed right with 9 as a possible outlier.',1,'foundation'),
      ('Compare center and spread of two or more data sets','Team A quiz scores: 70, 72, 74, 76, 78. Team B: 60, 68, 74, 82, 90. Compare mean and standard deviation, then say which team is more consistent.','Both means are 74. Team A standard deviation about 2.8; Team B about 10.6. Team A is far more consistent because its spread is much smaller.',2,'core'),
      ('Compare center and spread of two or more data sets','Two bus routes have the same median wait time of 9 minutes, but route 1 has IQR 2 minutes and route 2 has IQR 11 minutes. Which route would you choose and why?','Route 1. The centers match, but route 1 wait times vary much less, so the wait is far more predictable.',1,'foundation'),
      ('Interpret differences in shape, center and spread; account for outliers','Salaries at a small shop: 32, 34, 35, 36, 38, 40, 210 (thousands). Find the mean and median, then explain which better describes a typical salary.','Mean about 60.7 thousand, median 36 thousand. The 210 is an outlier that pulls the mean up, so the median better describes a typical salary.',2,'core'),
      ('Interpret differences in shape, center and spread; account for outliers','Using the 1.5 × IQR rule, decide whether 42 is an outlier for the data set 12, 15, 16, 18, 19, 21, 22, 42.','Q1 = 15.5, Q3 = 21.5, IQR = 6. Upper fence = 21.5 + 9 = 30.5. Since 42 > 30.5, yes, 42 is an outlier.',3,'extension'),
      ('Normal distribution and the empirical rule','Heights of students are normally distributed with mean 66 inches and standard deviation 3 inches. What percent of students are between 60 and 72 inches tall?','60 and 72 are 2 standard deviations from the mean, so about 95 percent.',1,'foundation'),
      ('Normal distribution and the empirical rule','Test scores are normal with mean 500 and standard deviation 100. Find the percent scoring above 700 and the score at the 84th percentile.','Above 700 is above 2 standard deviations: about 2.5 percent. The 84th percentile is 1 standard deviation above the mean: 600.',2,'core'),
      ('Normal distribution and the empirical rule','A machine fills bottles with mean 500 mL and standard deviation 4 mL. Bottles outside 492-508 mL are rejected. Out of 5,000 bottles, about how many are rejected?','492-508 mL is within 2 standard deviations, holding about 95 percent, so about 5 percent are rejected: roughly 250 bottles.',3,'extension'),
      ('Two-way frequency tables: joint, marginal and conditional relative frequencies','Of 200 students, 120 take a language and 80 do not; 70 of the language students also play a sport, and 30 non-language students play a sport. Build the two-way table and find the marginal totals.','Language/sport 70, language/no sport 50, no language/sport 30, no language/no sport 50. Marginals: language 120, no language 80, sport 100, no sport 100, total 200.',2,'core'),
      ('Two-way frequency tables: joint, marginal and conditional relative frequencies','Using the table above, find the conditional relative frequency of playing a sport given the student takes a language, and compare it to the overall rate.','70/120 = 0.583, about 58.3 percent, compared with an overall rate of 100/200 = 50 percent. Language students play sports at a somewhat higher rate.',2,'core'),
      ('Scatter plots; fit a function to data','Hours studied and test score pairs: (1,62), (2,68), (3,74), (4,79), (5,86). Fit a linear model by hand and predict the score for 6 hours.','Slope about (86-62)/4 = 6 points per hour, intercept about 56, so y ≈ 6x + 56. For x = 6, predicted score ≈ 92.',2,'core'),
      ('Scatter plots; fit a function to data','A bacteria count doubles roughly every hour: (0,50), (1,98), (2,205), (3,395), (4,810). Would a linear or exponential model fit better? Write the model.','Exponential. Ratios are near 2, so y ≈ 50(2)^x. A line would badly underestimate later values.',3,'extension'),
      ('Interpret slope and intercept of a linear model in context','A phone plan is modeled by C = 0.05m + 20, where m is minutes used. Interpret the slope and the intercept in context.','Slope: each extra minute costs 5 cents. Intercept: the plan costs $20 even with no minutes used.',1,'foundation'),
      ('Interpret slope and intercept of a linear model in context','A car value model is V = -1,800t + 24,000 for t years. Interpret both numbers and state when the model stops making sense.','The car loses $1,800 of value per year and was worth $24,000 when new. The model fails past about t = 13.3 years, where value would go negative.',2,'core'),
      ('Compute and interpret the correlation coefficient','A study finds r = -0.92 between hours of TV watched and reading score. Describe the direction and strength, and state what r says about a straight-line fit.','Strong negative linear relationship: more TV goes with lower reading scores. Because r is close to -1, a line fits the data closely.',1,'foundation'),
      ('Compute and interpret the correlation coefficient','Two data sets have r = 0.45 and r = -0.78. Which shows the stronger linear relationship, and why is r = 0.45 not evidence of a weak relationship of any kind?','r = -0.78 is stronger since |r| is larger. r = 0.45 only measures linear fit; the data could still follow a strong curved pattern.',3,'extension'),
      ('Distinguish between correlation and causation','Ice cream sales and drowning deaths are strongly correlated. Explain why ice cream does not cause drownings and name the likely lurking variable.','Both rise in hot weather, which increases swimming. Temperature is the lurking variable; correlation alone does not prove causation.',1,'foundation'),
      ('Distinguish between correlation and causation','A school reports that students who eat breakfast score higher on tests, and concludes breakfast raises scores. Critique the conclusion and design a study that could support it.','The data are observational, so home support, sleep, and income are confounded with breakfast. A randomized experiment assigning students to a free breakfast or not would support a causal claim.',3,'extension'),
      ('Statistics as a process for making inferences about a population','A principal surveys 60 of the 900 students about a schedule change. Identify the population, the sample, the parameter and the statistic.','Population: all 900 students. Sample: the 60 surveyed. Parameter: the true proportion of all students who favor the change. Statistic: the proportion in the sample who favor it.',1,'foundation'),
      ('Statistics as a process for making inferences about a population','Explain why a sample of 60 volunteers who answered a posted link may not support a conclusion about all 900 students.','Volunteers self-select, so students with strong opinions answer more often. The sample is biased and may not represent the population, no matter the sample size.',2,'core'),
      ('Evaluate a model by simulation','A coin is claimed fair. In 100 simulated sets of 40 flips, only 3 sets gave 26 or more heads. A student flips 27 heads in 40 flips. What do you conclude?','Getting 26 or more heads happened in about 3 percent of simulations, so 27 heads is unusual for a fair coin. There is evidence the coin is not fair.',3,'extension'),
      ('Evaluate a model by simulation','Describe how to use a random number table to simulate whether a basketball player who makes 70 percent of free throws makes at least 8 of 10 shots.','Assign digits 0-6 as a make and 7-9 as a miss. Read 10 digits as one trial, count makes, repeat many trials, then find the fraction of trials with 8 or more makes.',2,'core'),
      ('Surveys, experiments and observational studies; the role of randomization','For each study, name the type: (a) comparing test scores of students who chose band vs. those who did not, (b) randomly assigning patients to a new drug or a placebo, (c) mailing a questionnaire to 500 households.','(a) observational study, (b) experiment, (c) survey.',1,'foundation'),
      ('Surveys, experiments and observational studies; the role of randomization','Explain the purpose of random assignment in an experiment and how it differs from random selection in a survey.','Random assignment spreads other variables evenly across treatment groups so differences can be credited to the treatment. Random selection makes a sample represent the population so results can be generalized.',3,'extension'),
      ('Estimate a population mean or proportion; margin of error','In a random sample of 400 voters, 220 support a measure. Find the sample proportion and a margin of error of about 2 standard errors.','p̂ = 0.55. Standard error = √(0.55 × 0.45/400) ≈ 0.0249, so margin of error ≈ 0.05. Interval: roughly 50 percent to 60 percent.',3,'extension'),
      ('Estimate a population mean or proportion; margin of error','A poll reports 48 percent support with a margin of error of 4 percentage points. Write the interval and explain whether a claim of majority support is justified.','Interval: 44 percent to 52 percent. Because the interval includes values below 50 percent, the poll does not justify a claim of majority support.',2,'core'),
      ('Estimate a population mean or proportion; margin of error','A sample of 25 backpacks has a mean weight of 14.2 lb and standard deviation 2.5 lb. Estimate the mean weight of all backpacks with about 2 standard errors of margin.','Standard error = 2.5/√25 = 0.5, margin ≈ 1.0 lb, so the estimate is about 13.2 lb to 15.2 lb.',3,'extension'),
      ('Compare two treatments; decide whether differences are significant','Group A (new tutoring) mean gain 8.4 points, Group B (usual class) mean gain 5.1 points. A randomization test shows a difference this large in 2 of 200 shuffles. What do you conclude?','About 1 percent of random shuffles gave a gap that large, so the 3.3-point difference is unlikely to be chance alone. There is evidence the tutoring worked better.',4,'depth'),
      ('Compare two treatments; decide whether differences are significant','Two fertilizers give mean plant heights of 24.1 cm and 23.6 cm; a randomization test produces differences this large in 68 percent of shuffles. State the conclusion.','A gap this size is common by chance, so the difference is not significant. There is no evidence one fertilizer works better.',3,'extension'),
      ('Evaluate reports based on data','A soda company reports that 4 out of 5 dentists prefer its brand, based on 5 dentists it sponsors. List three problems with the report.','Sample size of 5 is far too small; sponsored dentists are not a random sample; no comparison brands or measurement details are given, so the result cannot be generalized.',2,'core'),
      ('Evaluate reports based on data','A headline reads: "Students who use the app score 15 percent higher." Name the missing information you would need before believing the claim.','Who was in the sample and how they were chosen, whether app use was randomly assigned, sample size, margin of error, what the scores measured, and whether other factors differed between groups.',3,'extension'),
      ('Describe events as subsets of a sample space','A fair die is rolled once. List the sample space, then list event A: an even number, and event B: a number greater than 4. Find A ∪ B and A ∩ B.','S = {1,2,3,4,5,6}, A = {2,4,6}, B = {5,6}. A ∪ B = {2,4,5,6}, A ∩ B = {6}.',1,'foundation'),
      ('Describe events as subsets of a sample space','Two coins are tossed. Write the sample space and the event "at least one head" as a subset, then give its probability.','S = {HH, HT, TH, TT}. At least one head = {HH, HT, TH}, probability 3/4.',1,'foundation'),
      ('Independence and the multiplication rule','A bag has 4 red and 6 blue chips. Two chips are drawn with replacement. Find the probability both are red, and state why the draws are independent.','P = (4/10)(4/10) = 0.16. With replacement the bag is unchanged, so the first draw does not affect the second.',2,'core'),
      ('Independence and the multiplication rule','Repeat the previous problem without replacement, and explain why the events are no longer independent.','P = (4/10)(3/9) = 12/90 = 2/15 ≈ 0.133. Removing a red chip changes the second probability, so the events are dependent.',3,'extension'),
      ('Conditional probability and independence','Given P(A) = 0.5, P(B) = 0.4 and P(A ∩ B) = 0.2, decide whether A and B are independent and find P(A | B).','P(A)P(B) = 0.2 = P(A ∩ B), so A and B are independent. P(A | B) = 0.2/0.4 = 0.5, which equals P(A), confirming independence.',3,'extension'),
      ('Conditional probability and independence','In a deck of 52 cards, find the probability a card is a king given that it is a face card.','There are 12 face cards and 4 kings among them, so P = 4/12 = 1/3.',2,'core'),
      ('Construct and interpret two-way tables of data','Of 150 people, 90 own a pet; 54 of the pet owners live in a house and 24 of the non-owners live in a house. Build the two-way table and find P(owns a pet | lives in a house).','Table: house/pet 54, house/no pet 24, apartment/pet 36, apartment/no pet 36. Houses total 78, so P = 54/78 ≈ 0.692.',3,'extension'),
      ('Construct and interpret two-way tables of data','From a two-way table, 45 of 120 students take art and 30 of those 45 also take music. Find the joint relative frequency of art and music.','30/120 = 0.25, so 25 percent of all students take both.',2,'core'),
      ('Conditional probability and independence in everyday situations','A weather app says P(rain) = 0.3 and P(traffic delay | rain) = 0.7, while P(traffic delay | no rain) = 0.2. Find the probability of a delay tomorrow.','P(delay) = 0.3(0.7) + 0.7(0.2) = 0.21 + 0.14 = 0.35.',4,'depth'),
      ('Conditional probability and independence in everyday situations','Explain in everyday terms what it means that being left-handed and liking pizza are independent events.','Knowing someone is left-handed tells you nothing about whether they like pizza; the share of pizza lovers is the same among left-handers as among everyone.',1,'foundation'),
      ('Conditional probability as a fraction of outcomes','In a class of 30, 18 play a sport and 12 of those also take a music class; 4 students take music but no sport. Find P(sport | music) as a fraction of outcomes.','Music students: 12 + 4 = 16. Of these, 12 play a sport, so P = 12/16 = 3/4.',3,'extension'),
      ('Conditional probability as a fraction of outcomes','A spinner has 8 equal sectors numbered 1-8. Find P(prime | odd) by counting outcomes.','Odd outcomes: 1, 3, 5, 7 (4 outcomes). Primes among them: 3, 5, 7 (3 outcomes). P = 3/4.',2,'core'),
      ('Apply the addition rule','In a group, P(plays soccer) = 0.45, P(plays chess) = 0.30 and P(both) = 0.12. Find the probability a person plays soccer or chess.','P = 0.45 + 0.30 - 0.12 = 0.63.',2,'core'),
      ('Apply the addition rule','A card is drawn from a standard deck. Find P(heart or face card) using the addition rule.','13/52 + 12/52 - 3/52 = 22/52 = 11/26 ≈ 0.423.',2,'core'),
      ('Apply the addition rule','Events M and N are mutually exclusive with P(M) = 0.24 and P(N) = 0.31. Find P(M or N) and P(M and N), and explain the difference from the general rule.','P(M or N) = 0.55 and P(M and N) = 0. For mutually exclusive events the overlap term is 0, so no subtraction is needed.',1,'foundation'),
      ('Define a random variable; graph its probability distribution','Let X be the number of heads in 3 tosses of a fair coin. List the distribution of X and describe its graph.','P(0) = 1/8, P(1) = 3/8, P(2) = 3/8, P(3) = 1/8. The bar graph is symmetric with the tallest bars at 1 and 2.',2,'core'),
      ('Define a random variable; graph its probability distribution','A spinner pays 1, 2 or 5 points with probabilities 0.5, 0.3 and 0.2. Define the random variable, verify the distribution is valid, and sketch it.','Let X be the points scored. Probabilities are non-negative and sum to 1.0, so it is valid. Bars of heights 0.5, 0.3 and 0.2 above 1, 2 and 5.',1,'foundation'),
      ('Calculate the expected value of a random variable','A game pays $5 with probability 0.1, $1 with probability 0.4 and $0 with probability 0.5. Find the expected payout.','E(X) = 5(0.1) + 1(0.4) + 0(0.5) = $0.90.',2,'core'),
      ('Calculate the expected value of a random variable','A raffle sells 500 tickets at $3 each with one $600 prize. Find the expected value for one ticket and say whether the ticket is a good buy.','E = 600(1/500) - 3 = 1.20 - 3 = -$1.80 per ticket. On average a buyer loses $1.80, so it is not a good buy financially.',3,'extension'),
      ('Calculate the expected value of a random variable','An insurance policy costs $250 per year. The company pays $9,000 with probability 0.02. Find the company''s expected profit per policy.','E = 250 - 9,000(0.02) = 250 - 180 = $70 profit per policy.',3,'extension'),
      ('Expected value under a theoretical probability distribution','A fair four-sided die is rolled once, showing 1-4. Find the theoretical expected value and compare it to a simulated average of 3.1 over 20 rolls.','E(X) = (1+2+3+4)/4 = 2.5. The simulated 3.1 is higher, which is normal variation for only 20 rolls; more rolls should approach 2.5.',3,'extension'),
      ('Expected value under a theoretical probability distribution','For a binomial setting of 10 free throws at 70 percent, find the expected number of makes and explain the formula used.','E(X) = np = 10(0.7) = 7 makes. For a binomial random variable the expected value is the number of trials times the success probability.',3,'extension'),
      ('Weigh outcomes and make decisions under uncertainty','Plan A: a certain $40 rebate. Plan B: a 30 percent chance of $150 and otherwise nothing. Compute both expected values and discuss which you would choose.','A: $40. B: 0.30(150) = $45. B has the higher expected value, but A is guaranteed; someone who cannot absorb a loss of the chance may still prefer A.',3,'extension'),
      ('Weigh outcomes and make decisions under uncertainty','A repair shop can offer a 2-year warranty for $80. Repairs cost $500 and happen with probability 0.12 in two years. Should a customer buy the warranty on expected value alone?','Expected repair cost = 0.12(500) = $60, which is less than $80, so on expected value alone the warranty is not worth it.',3,'extension'),
      ('Use probability to make fair decisions','Three friends must choose who pays. Describe a fair method using a die and explain why it is fair.','Assign each friend two faces of a fair die, roll once, and the matching friend pays. Each friend has probability 2/6 = 1/3, so the chances are equal.',1,'foundation'),
      ('Use probability to make fair decisions','A coin is slightly biased toward heads. Explain how to still make a fair 50-50 decision using that coin.','Flip twice: HT means choice 1, TH means choice 2, and HH or TT means flip again. The two mixed outcomes are equally likely even with a biased coin.',4,'depth'),
      ('Analyze decisions and strategies using probability concepts','In a quiz show, a contestant can keep $1,000 or answer a question worth $4,000 with a 35 percent chance of being right (a wrong answer loses everything). Analyze the choice.','Answering has expected value 0.35(4,000) = $1,400, which beats the certain $1,000. Still, 65 percent of the time the contestant gets nothing, so risk tolerance matters.',4,'depth'),
      ('Analyze decisions and strategies using probability concepts','A test for a rare condition affecting 1 percent of people is 95 percent accurate both ways. Of 10,000 people, build the table and find the probability someone who tests positive actually has the condition.','Has condition 100: 95 positive. No condition 9,900: 495 false positives. Positives total 590, so P ≈ 95/590 ≈ 0.161, only about 16 percent.',4,'depth')
    ) AS x(topic, prompt, answer, diff, band)
  LOOP
    SELECT id INTO tid FROM public.topics
      WHERE is_default AND teacher_id IS NULL AND name = v.topic LIMIT 1;

    IF EXISTS (SELECT 1 FROM public.questions q WHERE q.teacher_id = tch AND q.prompt_text = v.prompt) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.questions (teacher_id, prompt_text, answer_text, difficulty, band)
    VALUES (tch, v.prompt, v.answer, v.diff, v.band::question_band)
    RETURNING id INTO qid;

    IF tid IS NOT NULL THEN
      INSERT INTO public.question_topics (question_id, topic_id) VALUES (qid, tid)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;