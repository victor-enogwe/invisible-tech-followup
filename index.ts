import { LocationWeather } from './LocationWeather'

LocationWeather.getWeatherData(process.argv.slice(2)).then(locations => console.info(locations)).catch(err => console.error(err.message))
