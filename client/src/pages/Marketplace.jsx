import { useEffect, useState, useMemo } from "react";
import MarketCard from "../components/MarketCard";
import { loader } from "../assets";
import MoneyDistribution from "../abi/MoneyDistribution.json";
import Web3 from "web3";
import { useStateAuth } from "../context/StateProvider";
import { useNavigate } from "react-router-dom";

const MarketPlace = () => {
  const navigate = useNavigate();
  const { userData } = useStateAuth();

  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [products, setProducts] = useState([]);
  const [isMetamaskInstalled, setIsMetamaskInstalled] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  useEffect(() => {
    let isMounted = true;

    async function fetchProducts() {
      try {
        setLoading(true);
        setError("");

        const { ethereum } = window;
        if (!ethereum) {
          if (isMounted) setIsMetamaskInstalled(false);
          return;
        }

        if (isMounted) setIsMetamaskInstalled(true);
        const web3 = new Web3(ethereum);
        const networkId = await web3.eth.net.getId();
        const deployedNetwork = MoneyDistribution.networks[networkId];

        if (!deployedNetwork) {
          throw new Error(
            "Smart contract not deployed to the detected network. Please configure MetaMask correctly.",
          );
        }

        const contract = new web3.eth.Contract(
          MoneyDistribution.abi,
          deployedNetwork.address,
        );

        const res = await contract.methods.getProducts().call();

        if (isMounted) {
          setProducts(res);
        }
      } catch (err) {
        if (isMounted) {
          console.error("Fetch products error:", err);
          setError(err.message || "Failed to fetch products");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredAndSortedProducts = useMemo(() => {
    let filtered = products.filter(
      (product) =>
        product.owner?.toLowerCase() !== userData?.walletAddress?.toLowerCase(),
    );

    if (searchTerm.trim()) {
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    filtered.sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      } else if (sortBy === "reward_high") {
        const valA = Number(a.nextAmount || a.amt || 0);
        const valB = Number(b.nextAmount || b.amt || 0);
        return valB - valA;
      } else if (sortBy === "reward_low") {
        const valA = Number(a.nextAmount || a.amt || 0);
        const valB = Number(b.nextAmount || b.amt || 0);
        return valA - valB;
      }
      return 0;
    });

    return filtered;
  }, [products, userData, searchTerm, sortBy]);

  return (
    <div>
      {!isMetamaskInstalled && (
        <div className="bg-red-500/20 text-red-500 p-4 rounded-md mb-4 border border-red-500/50">
          <h1 className="font-epilogue font-semibold text-[18px]">
            Please install MetaMask to interact with the Marketplace.
          </h1>
        </div>
      )}

      {error && (
        <div className="bg-red-500/20 text-red-500 p-4 rounded-md mb-4 border border-red-500/50">
          <h1 className="font-epilogue font-semibold text-[18px]">
            Error: {error}
          </h1>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="font-epilogue font-semibold text-[18px] text-white text-left">
          Marketplace of products ({filteredAndSortedProducts.length})
        </h1>

        <div className="flex flex-wrap gap-4 w-full md:w-auto">
          <input
            type="text"
            placeholder="Search by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-[#1c1c24] text-white border border-[#2c2f32] rounded-[10px] px-4 py-2 min-w-[200px]"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-[#1c1c24] text-white border border-[#2c2f32] rounded-[10px] px-4 py-2"
          >
            <option value="newest">Sort by: Default</option>
            <option value="name">Name (A-Z)</option>
            <option value="reward_high">Reward (High to Low)</option>
            <option value="reward_low">Reward (Low to High)</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap mt-[20px] gap-[26px]">
        {isLoading && (
          <div className="w-full flex justify-center items-center mt-10">
            <img
              src={loader}
              alt="loader"
              className="w-[100px] h-[100px] object-contain"
            />
          </div>
        )}

        {!isLoading && filteredAndSortedProducts.length === 0 && !error && (
          <p className="font-epilogue font-semibold text-[14px] leading-[30px] text-[#818183]">
            No products to display
          </p>
        )}

        {!isLoading &&
          filteredAndSortedProducts.map((product) => (
            <MarketCard
              key={product.id}
              {...product}
              handleClick={() =>
                navigate(`/company/product-details/${product.id}`)
              }
            />
          ))}
      </div>
    </div>
  );
};

export default MarketPlace;
