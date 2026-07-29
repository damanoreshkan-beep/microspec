// arc — the landing shelves. Curated, committed, and verified: every entry below was checked to exist, to
// pass `isBook`, and to carry a plot section of at least 1500 characters, because a book whose article has
// no plot is a dead end the moment someone taps it.
//
// TITLES ARE DISAMBIGUATED ON PURPOSE. The bare title is a trap: "Shadows of Forgotten Ancestors" resolves
// to Paradjanov's FILM, "The City" to something else entirely, "Felix Austria" and "Black Council" to other
// subjects. Four of twelve Ukrainian entries were wrong when looked up by plain title — hence the explicit
// "(novel)" forms and the committed pageids.
//
// Static rather than queried, deliberately: it is deterministic, offline-safe, costs ONE batched request
// for every shelf at once, and cannot drift when a Wikipedia category is re-organised. The one group that
// genuinely needed to be live — "recent releases" — was measured and dropped: of 35 articles in the 2025
// and 2026 novel categories only 6 (17.1%) had a usable plot and NONE had a cover, so the shelf would have
// been mostly empty tiles under a label that promised novelty.
//
// Author names are carried in both locales because Wikidata returns them in one, and a Ukrainian reader
// should not meet "Panas Myrnyi" on a shelf of Ukrainian literature.
export const CURATED = {
  ukr: [
    { id: "76319809", pageid: 76319809, title: "Do Oxen Low When Mangers are Full?", uk: "Панас Мирний", en: "Panas Myrnyi" },
    { id: "63044859", pageid: 63044859, title: "Eneida", uk: "Іван Котляревський", en: "Ivan Kotliarevskyi" },
    { id: "67056851", pageid: 67056851, title: "The Stone Cross", uk: "Василь Стефаник", en: "Vasyl Stefanyk" },
    { id: "81628749", pageid: 81628749, title: "Black Council (novel)", uk: "Пантелеймон Куліш", en: "Panteleimon Kulish" },
    { id: "67040872", pageid: 67040872, title: "The Forest Song", uk: "Леся Українка", en: "Lesya Ukrainka" },
    { id: "21474059", pageid: 21474059, title: "The Moscoviad", uk: "Юрій Андрухович", en: "Yuri Andrukhovych" },
    { id: "73531852", pageid: 73531852, title: "Felix Austria (novel)", uk: "Софія Андрухович", en: "Sofia Andrukhovych" },
    { id: "70107878", pageid: 70107878, title: "Shadows of Forgotten Ancestors (novel)", uk: "Михайло Коцюбинський", en: "Mykhailo Kotsiubynskyi" },
    { id: "3486671", pageid: 3486671, title: "Death and the Penguin", uk: "Андрій Курков", en: "Andrey Kurkov" },
    { id: "73525897", pageid: 73525897, title: "Fieldwork in Ukrainian Sex", uk: "Оксана Забужко", en: "Oksana Zabuzhko" },
    { id: "70246330", pageid: 70246330, title: "The Witch of Konotop", uk: "Григорій Квітка-Основ'яненко", en: "Hryhorii Kvitka-Osnovianenko" },
    { id: "44578964", pageid: 44578964, title: "The City (Pidmohylny novel)", uk: "Валер'ян Підмогильний", en: "Valerian Pidmohylny" },
  ],
  canon: [
    { id: "133874", pageid: 133874, title: "Crime and Punishment", uk: "Федір Достоєвський", en: "Fyodor Dostoevsky" },
    { id: "654705", pageid: 654705, title: "One Hundred Years of Solitude", uk: "Ґабріель Ґарсіа Маркес", en: "Gabriel García Márquez" },
    { id: "438390", pageid: 438390, title: "Things Fall Apart", uk: "Чинуа Ачебе", en: "Chinua Achebe" },
    { id: "145429", pageid: 145429, title: "The Tale of Genji", uk: "Мурасакі Сікібу", en: "Murasaki Shikibu" },
    { id: "8237", pageid: 8237, title: "Don Quixote", uk: "Мігель де Сервантес", en: "Miguel de Cervantes" },
    { id: "1268726", pageid: 1268726, title: "Beloved (novel)", uk: "Тоні Моррісон", en: "Toni Morrison" },
    { id: "333987", pageid: 333987, title: "The Master and Margarita", uk: "Михайло Булгаков", en: "Mikhail Bulgakov" },
    { id: "232367", pageid: 232367, title: "Journey to the West", uk: "У Ченьень", en: "Wu Cheng'en" },
    { id: "24162", pageid: 24162, title: "Pride and Prejudice", uk: "Джейн Остін", en: "Jane Austen" },
    { id: "2887589", pageid: 2887589, title: "Season of Migration to the North", uk: "Тайїб Саліх", en: "Tayeb Salih" },
  ],
  genre: [
    { id: "30280", pageid: 30280, title: "The Hound of the Baskervilles", uk: "Артур Конан Дойл", en: "Arthur Conan Doyle" },
    { id: "71416", pageid: 71416, title: "Dune (novel)", uk: "Френк Герберт", en: "Frank Herbert" },
    { id: "7923", pageid: 7923, title: "Dracula", uk: "Брем Стокер", en: "Bram Stoker" },
    { id: "23713951", pageid: 23713951, title: "The Left Hand of Darkness", uk: "Урсула Ле Ґуїн", en: "Ursula K. Le Guin" },
    { id: "68348", pageid: 68348, title: "The Big Sleep", uk: "Реймонд Чандлер", en: "Raymond Chandler" },
    { id: "1259759", pageid: 1259759, title: "Rebecca (novel)", uk: "Дафна дю Мор'є", en: "Daphne du Maurier" },
    { id: "21725", pageid: 21725, title: "Neuromancer", uk: "Вільям Ґібсон", en: "William Gibson" },
    { id: "186397", pageid: 186397, title: "The Name of the Rose", uk: "Умберто Еко", en: "Umberto Eco" },
    { id: "37986566", pageid: 37986566, title: "Gone Girl (novel)", uk: "Ґіліян Флінн", en: "Gillian Flynn" },
    { id: "1964153", pageid: 1964153, title: "The Haunting of Hill House", uk: "Ширлі Джексон", en: "Shirley Jackson" },
  ],
  screen: [
    { id: "29999", pageid: 29999, title: "The Shining (novel)", uk: "Стівен Кінг", en: "Stephen King" },
    { id: "23854860", pageid: 23854860, title: "Fight Club (novel)", uk: "Чак Поланік", en: "Chuck Palahniuk" },
    { id: "3134572", pageid: 3134572, title: "No Country for Old Men (novel)", uk: "Кормак Маккарті", en: "Cormac McCarthy" },
    { id: "5326809", pageid: 5326809, title: "Jurassic Park (novel)", uk: "Майкл Крайтон", en: "Michael Crichton" },
    { id: "23284", pageid: 23284, title: "Do Androids Dream of Electric Sheep?", uk: "Філіп Дік", en: "Philip K. Dick" },
    { id: "4608346", pageid: 4608346, title: "The Silence of the Lambs (novel)", uk: "Томас Гарріс", en: "Thomas Harris" },
    { id: "233084", pageid: 233084, title: "Trainspotting (novel)", uk: "Ірвін Велш", en: "Irvine Welsh" },
    { id: "163629", pageid: 163629, title: "American Psycho", uk: "Бret Істон Елліс", en: "Bret Easton Ellis" },
    { id: "133721", pageid: 133721, title: "The Remains of the Day", uk: "Кадзуо Ішіґуро", en: "Kazuo Ishiguro" },
  ],
};

// Shelf order on the landing screen. Ukrainian first: this farm's reader is Ukrainian, and a shelf of world
// canon is what every other reading app opens with.
export const SHELVES = ["ukr", "canon", "genre", "screen"];
