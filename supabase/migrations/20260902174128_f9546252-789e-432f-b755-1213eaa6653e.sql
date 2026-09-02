ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS secondary_standard text;

INSERT INTO public.topics (teacher_id, name, description, is_default)
SELECT NULL, v.name, NULL, true
FROM (VALUES
  ('Represent data with plots on the real number line: dot plots, histograms, box plots', 'CUNY BMCC MAT 150: construct and interpret simple statistical charts'),
  ('Compare center and spread of two or more data sets', 'CUNY BMCC MAT 150: calculate key statistics and parameters'),
  ('Interpret differences in shape, center and spread; account for outliers', 'CUNY BMCC MAT 150: calculate key statistics and parameters'),
  ('Normal distribution and the empirical rule', 'CUNY BMCC MAT 150: probabilities from continuous distributions'),
  ('Two-way frequency tables: joint, marginal and conditional relative frequencies', 'CUNY BMCC MAT 150: construct and interpret simple statistical charts'),
  ('Scatter plots; fit a function to data', 'CUNY BMCC MAT 150: concepts in regression and correlation'),
  ('Interpret slope and intercept of a linear model in context', 'CUNY BMCC MAT 150: concepts in regression and correlation'),
  ('Compute and interpret the correlation coefficient', 'CUNY BMCC MAT 150: concepts in regression and correlation'),
  ('Distinguish between correlation and causation', 'CUNY BMCC MAT 150: concepts in regression and correlation'),
  ('Statistics as a process for making inferences about a population', 'CUNY BMCC MAT 150: define the vocabulary, terminology and symbols of statistics'),
  ('Evaluate a model by simulation', 'CUNY BMCC MAT 150: calculate confidence intervals and construct hypothesis tests'),
  ('Surveys, experiments and observational studies; the role of randomization', 'CUNY BMCC MAT 150: plan an experiment or survey and gather data'),
  ('Estimate a population mean or proportion; margin of error', 'CUNY BMCC MAT 150: calculate confidence intervals and construct hypothesis tests'),
  ('Compare two treatments; decide whether differences are significant', 'CUNY BMCC MAT 150: calculate confidence intervals and construct hypothesis tests'),
  ('Evaluate reports based on data', 'CUNY BMCC MAT 150: draw conclusions from data'),
  ('Describe events as subsets of a sample space', 'CUNY BMCC MAT 150: calculate elementary probabilities'),
  ('Independence and the multiplication rule', 'CUNY BMCC MAT 150: calculate elementary probabilities'),
  ('Conditional probability and independence', 'CUNY BMCC MAT 150: calculate elementary probabilities'),
  ('Construct and interpret two-way tables of data', 'CUNY BMCC MAT 150: construct and interpret simple statistical charts'),
  ('Conditional probability and independence in everyday situations', 'CUNY BMCC MAT 150: calculate elementary probabilities'),
  ('Conditional probability as a fraction of outcomes', 'CUNY BMCC MAT 150: calculate elementary probabilities'),
  ('Apply the addition rule', 'CUNY BMCC MAT 150: calculate elementary probabilities'),
  ('Define a random variable; graph its probability distribution', 'CUNY BMCC MAT 150: probabilities from continuous distributions'),
  ('Calculate the expected value of a random variable', 'CUNY BMCC MAT 150: calculate key statistics and parameters'),
  ('Expected value under a theoretical probability distribution', 'CUNY BMCC MAT 150: probabilities from continuous distributions'),
  ('Weigh outcomes and make decisions under uncertainty', 'CUNY BMCC MAT 150: draw conclusions from data'),
  ('Use probability to make fair decisions', 'CUNY BMCC MAT 150: calculate elementary probabilities'),
  ('Analyze decisions and strategies using probability concepts', 'CUNY BMCC MAT 150: draw conclusions from data')
) AS v(name, secondary)
ON CONFLICT DO NOTHING;

UPDATE public.topics t
SET secondary_standard = v.secondary
FROM (VALUES
  ('Represent data with plots on the real number line: dot plots, histograms, box plots', 'CUNY BMCC MAT 150: construct and interpret simple statistical charts'),
  ('Compare center and spread of two or more data sets', 'CUNY BMCC MAT 150: calculate key statistics and parameters'),
  ('Interpret differences in shape, center and spread; account for outliers', 'CUNY BMCC MAT 150: calculate key statistics and parameters'),
  ('Normal distribution and the empirical rule', 'CUNY BMCC MAT 150: probabilities from continuous distributions'),
  ('Two-way frequency tables: joint, marginal and conditional relative frequencies', 'CUNY BMCC MAT 150: construct and interpret simple statistical charts'),
  ('Scatter plots; fit a function to data', 'CUNY BMCC MAT 150: concepts in regression and correlation'),
  ('Interpret slope and intercept of a linear model in context', 'CUNY BMCC MAT 150: concepts in regression and correlation'),
  ('Compute and interpret the correlation coefficient', 'CUNY BMCC MAT 150: concepts in regression and correlation'),
  ('Distinguish between correlation and causation', 'CUNY BMCC MAT 150: concepts in regression and correlation'),
  ('Statistics as a process for making inferences about a population', 'CUNY BMCC MAT 150: define the vocabulary, terminology and symbols of statistics'),
  ('Evaluate a model by simulation', 'CUNY BMCC MAT 150: calculate confidence intervals and construct hypothesis tests'),
  ('Surveys, experiments and observational studies; the role of randomization', 'CUNY BMCC MAT 150: plan an experiment or survey and gather data'),
  ('Estimate a population mean or proportion; margin of error', 'CUNY BMCC MAT 150: calculate confidence intervals and construct hypothesis tests'),
  ('Compare two treatments; decide whether differences are significant', 'CUNY BMCC MAT 150: calculate confidence intervals and construct hypothesis tests'),
  ('Evaluate reports based on data', 'CUNY BMCC MAT 150: draw conclusions from data'),
  ('Describe events as subsets of a sample space', 'CUNY BMCC MAT 150: calculate elementary probabilities'),
  ('Independence and the multiplication rule', 'CUNY BMCC MAT 150: calculate elementary probabilities'),
  ('Conditional probability and independence', 'CUNY BMCC MAT 150: calculate elementary probabilities'),
  ('Construct and interpret two-way tables of data', 'CUNY BMCC MAT 150: construct and interpret simple statistical charts'),
  ('Conditional probability and independence in everyday situations', 'CUNY BMCC MAT 150: calculate elementary probabilities'),
  ('Conditional probability as a fraction of outcomes', 'CUNY BMCC MAT 150: calculate elementary probabilities'),
  ('Apply the addition rule', 'CUNY BMCC MAT 150: calculate elementary probabilities'),
  ('Define a random variable; graph its probability distribution', 'CUNY BMCC MAT 150: probabilities from continuous distributions'),
  ('Calculate the expected value of a random variable', 'CUNY BMCC MAT 150: calculate key statistics and parameters'),
  ('Expected value under a theoretical probability distribution', 'CUNY BMCC MAT 150: probabilities from continuous distributions'),
  ('Weigh outcomes and make decisions under uncertainty', 'CUNY BMCC MAT 150: draw conclusions from data'),
  ('Use probability to make fair decisions', 'CUNY BMCC MAT 150: calculate elementary probabilities'),
  ('Analyze decisions and strategies using probability concepts', 'CUNY BMCC MAT 150: draw conclusions from data')
) AS v(name, secondary)
WHERE t.teacher_id IS NULL AND t.name = v.name AND t.secondary_standard IS DISTINCT FROM v.secondary;