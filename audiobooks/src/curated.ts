import { parseDuration } from './api';

// Hand-picked LibriVox recordings (each checked for playable chapters on
// 2026-11-28). LibriVox only has public-domain books, so the newest are from
// about 1930. These lean toward the 1900s-1930 end of the catalogue.
export type Pick = { id: string; title: string; author: string; year?: number; runtime: number };

const p = (id: string, title: string, author: string, year: number | undefined, runtime: string): Pick => ({
  id, title, author, year, runtime: parseDuration(runtime),
});

export const KIDS_SHELVES: { title: string; blurb: string; books: Pick[] }[] = [
  {
    title: 'Bedtime and little ones',
    blurb: 'Short, gentle stories to wind down with',
    books: [
      p('velveteenduet_librivox', 'The Velveteen Rabbit', 'Margery Williams', 1922, '22:44'),
      p('winniethepooh_2201_librivox', 'Winnie-the-Pooh', 'A. A. Milne', 1926, '2:54:29'),
      p('houseatpoohcorner_2402_librivox', 'The House at Pooh Corner', 'A. A. Milne', 1928, '3:02:55'),
      p('thetaleofpeterrabbitandothers_2008_librivox', 'The Tale of Peter Rabbit and Others', 'Beatrix Potter', 1902, '2:57:33'),
      p('flittlepigrobinson_2601_librivox', 'The Tale of Little Pig Robinson', 'Beatrix Potter', 1930, '1:06:01'),
      p('raggedy_ann_librivox', 'Raggedy Ann Stories', 'Johnny Gruelle', 1918, '1:49:53'),
      p('old_mother_west_wind_law_librivox', 'Old Mother West Wind', 'Thornton W. Burgess', 1910, '1:38:58'),
      p('unclewiggilyinwonderland_version2_2010_librivox', 'Uncle Wiggily in Wonderland', 'Howard R. Garis', undefined, '3:01:26'),
      p('just_so_stories', 'Just So Stories', 'Rudyard Kipling', 1902, '3:33:01'),
    ],
  },
  {
    title: 'Mysteries and adventures',
    blurb: 'Detectives, inventors and talking animals',
    books: [
      p('towertreasurev5_2404_librivox', 'The Hardy Boys: The Tower Treasure', 'Franklin W. Dixon', 1927, '4:10:02'),
      p('secretoldclockver2_2602_librivox', 'Nancy Drew: The Secret of the Old Clock', 'Carolyn Keene', 1930, '3:29:33'),
      p('hiddenstaircase_2601_librivox', 'Nancy Drew: The Hidden Staircase', 'Carolyn Keene', 1930, '4:47:57'),
      p('mysterycabinisland_2501_librivox', 'The Hardy Boys: The Mystery of Cabin Island', 'Franklin W. Dixon', 1929, '4:13:33'),
      p('story_of_doctor_dolittle_librivox', 'The Story of Doctor Dolittle', 'Hugh Lofting', 1920, '3:08:46'),
      p('bobbsey_twins_deep_blue_sea_1902_librivox', 'The Bobbsey Twins on the Deep Blue Sea', 'Laura Lee Hope', 1918, '4:24:42'),
      p('tom_swift_diamond_makers_1309_librivox', 'Tom Swift Among the Diamond Makers', 'Victor Appleton', 1911, '4:31:36'),
      p('justwilliam_dw_librivox', 'Just William', 'Richmal Crompton', 1922, '5:58:41'),
    ],
  },
  {
    title: 'Big-kid classics',
    blurb: 'The ones worth knowing, read aloud',
    books: [
      p('peter_pan_0707_librivox', 'Peter Pan', 'J. M. Barrie', 1911, '5:04:09'),
      p('wizard_of_oz', 'The Wonderful Wizard of Oz', 'L. Frank Baum', 1900, '3:44:51'),
      p('wind_in_the_willows_collab_librivox', 'The Wind in the Willows', 'Kenneth Grahame', 1908, '6:29:43'),
      p('toadoftoadhall_2603_librivox', 'Toad of Toad Hall', 'A. A. Milne', 1929, '3:18:37'),
      p('bambialifeinthewoods_2402_librivox', 'Bambi: A Life in the Woods', 'Felix Salten', 1923, '4:52:42'),
      p('secret_garden_librivox', 'The Secret Garden', 'Frances Hodgson Burnett', 1911, '9:08:25'),
      p('anne_greengables_librivox', 'Anne of Green Gables', 'L. M. Montgomery', 1908, '8:37:32'),
      p('fivechildren_librivox', 'Five Children and It', 'E. Nesbit', 1902, '5:38:46'),
      p('ozma_of_oz_librivox', 'Ozma of Oz', 'L. Frank Baum', 1907, '4:06:57'),
      p('hitty_2607_librivox', 'Hitty, Her First Hundred Years', 'Rachel Field', 1929, '6:15:32'),
    ],
  },
];

export const NEWER: Pick[] = [
  p('greatgatsby_2101_librivox', 'The Great Gatsby', 'F. Scott Fitzgerald', 1925, '5:38:03'),
  p('themaltesefalconnovel_2603_librivox', 'The Maltese Falcon', 'Dashiell Hammett', 1930, '6:48:36'),
  p('sunalsorises_2202_librivox', 'The Sun Also Rises', 'Ernest Hemingway', 1926, '6:43:12'),
  p('redharvest_2502_librivox', 'Red Harvest', 'Dashiell Hammett', 1929, '6:24:18'),
  p('farewelltoarms_2501_librivox', 'A Farewell to Arms', 'Ernest Hemingway', 1929, '8:21:24'),
  p('mrsdalloway_2103_librivox', 'Mrs. Dalloway', 'Virginia Woolf', 1925, '7:53:51'),
  p('39_steps_0807_librivox', 'The Thirty-Nine Steps', 'John Buchan', 1915, '4:20:42'),
  p('tarzan_apes_mfs', 'Tarzan of the Apes', 'Edgar Rice Burroughs', 1912, '9:20:59'),
  p('princess_of_mars_librivox', 'A Princess of Mars', 'Edgar Rice Burroughs', 1912, '7:10:09'),
  p('siddhartha_ap_librivox', 'Siddhartha', 'Hermann Hesse', 1922, '5:06:16'),
  p('prophet1_1901_librivox', 'The Prophet', 'Kahlil Gibran', 1923, '1:29:09'),
  p('metamorphosis_librivox', 'The Metamorphosis', 'Franz Kafka', 1915, '2:34:25'),
  p('captain_blood_librivox', 'Captain Blood', 'Rafael Sabatini', 1922, '12:11:54'),
  p('hound_baskervilles_librivox', 'The Hound of the Baskervilles', 'Arthur Conan Doyle', 1902, '5:52:59'),
];

/** A taste of each kids' shelf for the Home page. */
export const KIDS_SAMPLER: Pick[] = [0, 1, 2, 3].flatMap((i) => KIDS_SHELVES.map((s) => s.books[i])).filter(Boolean);
