import axios from 'axios'
import { pick } from 'lodash'
import { writeFile, stat } from 'fs'
import path from 'path'

if (process.env.NODE_ENV === 'development') { require('dotenv').config() }

/**
 * weather data for location
 *
 * @interface Weather
 */
interface Weather {
  timezone: string
  ob_time: string
  city_name: string
  datetime: string
  weather: {
    description: string
  }
}

/**
 * weather data response from weatherbit.io/v2.0/current
 *
 * @interface WeatherData
 */
interface WeatherData { data: [Weather] }

/**
 * Local cache - an  object containing weather data by location
 *
 * @interface Cache
 */
interface Cache { [key: string]: Weather }

type Location = string | number
export type Locations = Location[]

/**
 * LocationWeather
 * Class that generates weather data from supplied postal codes and city names.
 * Api key from weatherbit.io required in env variable API_KEY.
 *
 * @export
 * @class LocationWeather
 */
export class LocationWeather {
  private static dataUrl = 'https://api.weatherbit.io/v2.0/current'
  private static _cache: Cache
  public static apiKey = process.env.API_KEY

  /**
   * getWeatherData
   * Gets the weather form an  array of locations containing city names and postal codes.
   *
   * @static
   * @memberof LocationWeather
   *
   * @param {Locations} locations
   *
   * @returns {Promise<Cache>}
   */
  public static async getWeatherData (locations: Locations): Promise<Cache> {
    try {
      if (!LocationWeather.apiKey) {
        throw new ReferenceError('please supply a valid api key')
      }

      LocationWeather._validateLocations(locations)
      const fromApi = LocationWeather._filterCachedLocations(true, locations)
      const fromCache = LocationWeather._filterCachedLocations(false, locations)
      const apiData = fromApi.length ? await LocationWeather._getWeatherByLocationsFromApi(fromApi) : {}

      return { ...apiData, ...LocationWeather._getWeatherByLocationsFromCache(fromCache) }
    } catch (error) {
      throw new Error(error.message)
    }
  }

  /**
   * _getWeatherByLocationsFromApi
   * Gets the weather from an array of locations containing city names and postal codes.
   * Uses the _request static method.
   *
   * @private
   * @static
   * @memberof LocationWeather
   *
   * @param {Locations} locations
   *
   * @returns {Promise<Cache>}
   */
  private static async _getWeatherByLocationsFromApi (locations: Locations): Promise<Cache> {
    return axios.all(locations.map(LocationWeather._request)).then(LocationWeather._normalizeApiData).then(LocationWeather._writeToCache)
  }

  /**
   * getWeatherByLocationsFromCache
   * Gets the weather from an array of locations containing city names and postal codes.
   * Queries the local cache(data.json) for data.
   *
   * @private
   * @static
   * @memberof LocationWeather
   *
   * @param {Locations} locations
   *
   * @returns {Cache}
   */
  private static _getWeatherByLocationsFromCache (locations: Locations): Cache {
    return pick(LocationWeather._cache, locations)
  }

  /**
   * _request
   * makes a request for weather data
   * Makes a call to the weatherbbit.io/v2.0/current end point
   *
   * @private
   * @static
   * @memberof LocationWeather
   *
   * @param {Location} location
   *
   * @returns {Promise<WeatherData>}
   */
  private static async _request (location: Location): Promise<WeatherData> {
    try {
      const locationType = /\d+/.test(location.toString()) ? 'postal_code' : 'city'
      const queryParams = `?${locationType}=${location}&key=${LocationWeather.apiKey}`
      return axios.get<WeatherData>(`${LocationWeather.dataUrl}${queryParams}`, {
        transformResponse: LocationWeather._transformWeatherData.bind(location)
      }).then(response => response.data)
    } catch (error) {
      throw error
    }
  }

  /**
   * _normalizeApiData
   * normalize api response to Cache acceptable format
   *
   * @private
   * @static
   * @memberof LocationWeather
   *
   * @param {WeatherData[]} weatherData
   *
   * @returns {Cache}
   */
  private static _normalizeApiData (weatherData: WeatherData[]): Cache {
    return Object.assign({}, ...weatherData)
  }

  /**
   * _transformWeatherData
   * transform api response to Cache format
   *
   * @private
   * @static
   * @memberof LocationWeather
   *
   * @param {Location} this
   * @param {string} apiData
   *
   * @returns {Cache}
   */
  private static _transformWeatherData (this: Location, apiData: string): Cache {
    try {
      const weatherData: WeatherData = JSON.parse(apiData)
      const { data: [{ city_name, timezone, weather, ob_time, datetime }] } = weatherData
      return { [this]: { city_name, timezone, ob_time, weather, datetime } }
    } catch (error) {
      throw new Error(`no weather data for ${this}`)
    }
  }

  /**
   * _validateLocations
   * Checks if array of location supplied is valid
   *
   * @private
   * @static
   * @memberof LocationWeather
   *
   * @param {Locations} locations
   *
   * @returns {boolean}
   */
  private static _validateLocations (locations: Locations): boolean {
    if (!Array.isArray(locations)) {
      throw new TypeError('data set should be an array containing locations and postal codes')
    } else if (!locations.length) {
      throw new Error('data set should not be empty')
    } else if (locations.length > 10) {
      throw new Error('data set should not contain more than 10 entries')
    } else if (!locations.every((location: any) => (typeof location === 'string' || typeof location === 'number'))) {
      throw new TypeError('each location should be a city(string) or zipcode(integer)')
    }

    return true
  }

  /**
   * _filterCachedLocations
   * select kocations from cache based on cache location expiry
   *
   * @private
   * @static
   * @memberof LocationWeather
   *
   * @param {boolean} flag
   * @param {Locations} locations
   *
   * @returns
   */
  private static _filterCachedLocations (flag: boolean, locations: Locations) {
    return locations.filter(location => LocationWeather._locationCacheExpired(location) === flag)
  }

  private static async _caccheExists () {
    const file = path.resolve(__dirname, './data.json')
    return new Promise((resolve, reject) => stat(file, (err) => err ? reject(err) : resolve(true))).catch(() => true)
  }

  /**
   * _locationCacheExpired
   * Checks to see if cahce has expired for location.
   * Cache has life span of  an hour.
   *
   * @private
   * @static
   * @memberof LocationWeather
   *
   * @param {string} place
   *
   * @returns boolean
   */
  private static _locationCacheExpired (location: Location): boolean {
    try {
      const { ob_time } = LocationWeather._cache[location]
      const time = new Date(ob_time)
      const now = new Date()
      time.setHours(time.getHours() + 1)

      return time.getTime() > now.getTime()
    } catch (error) {
      return true
    }
  }

  /**
   * _writeToCache
   * Store Weather Data in Cache
   *
   * @private
   * @static
   * @memberof LocationWeather
   *
   * @param {Cache} data
   *
   * @returns Promise<Cache>
   */
  private static async _writeToCache (data: Cache): Promise<Cache> {
    const content = JSON.stringify({ ...LocationWeather._cache, ...data })
    const file = path.resolve(__dirname, './data.json')
    const flag = await LocationWeather._caccheExists() ? undefined : 'wx'
    await new Promise((resolve, reject) => writeFile(file, content, { flag }, (error) => error ? reject(error) : resolve(data)))
    LocationWeather._cache = data
    return data
  }
}
